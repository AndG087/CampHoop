import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('modelo DrawSQL funciona em PostgreSQL com integridade e sem alterar public', async () => {
  const db = await PGlite.create()
  try {
    await db.exec('CREATE TABLE public.preservar (id integer); INSERT INTO public.preservar VALUES (42)')
    await db.exec(await readFile(new URL('../sql/modelo_felipe_postgresql.sql', import.meta.url), 'utf8'))
    assert.deepEqual((await db.query('SELECT * FROM public.preservar')).rows, [{ id: 42 }])
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='camphoop_modelo'")
    assert.equal(tables.rows.length, 15)
    await db.exec('SET search_path TO camphoop_modelo')
    const fkCount = await db.query("SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE table_schema='camphoop_modelo' AND constraint_type='FOREIGN KEY'")
    assert.equal(fkCount.rows[0].n, 20)

    async function id(sql, params = []) {
      return Object.values((await db.query(sql, params)).rows[0])[0]
    }
    const users = []
    for (let i = 0; i < 4; i++) {
      users.push(await id("INSERT INTO usuario(email,senha_hash,nome_completo,data_nascimento,cpf) VALUES ($1,'hash-teste',$2,'2000-01-01',$3) RETURNING id_usuario", [`pessoa${i}@example.test`, `Pessoa ${i}`, `0000000000${i}`]))
    }
    await db.query('INSERT INTO organizador VALUES ($1)', [users[0]])
    await db.query('INSERT INTO tecnico VALUES ($1)', [users[0]])
    await db.query('INSERT INTO mesario VALUES ($1)', [users[0]])
    for (const user of users.slice(1)) {
      await db.query("INSERT INTO atleta VALUES ($1,'registro',NULL,'D','armador')", [user])
    }
    const club = await id("INSERT INTO clube(nome,sigla,cnpj,cidade,uf,escudo,data_fundacao,responsavel) VALUES ('Clube','CL','00000000000001','Cidade','SP','escudo.svg','2000-01-01',$1) RETURNING id_clube", [users[0]])
    const teams = []
    for (let i = 0; i < 2; i++) {
      teams.push(await id("INSERT INTO equipe(id_tecnico,nome,clube_id,categoria) VALUES ($1,$2,$3,'Sub-17') RETURNING id_equipe", [users[0], `Equipe ${i}`, club]))
    }
    const cups = [], phases = []
    for (let i = 0; i < 2; i++) {
      cups.push(await id("INSERT INTO campeonato(id_organizador,nome,temporada,data_inicio,data_final,pontos_vitoria,pontos_derrota,pontos_empate,regulamento) VALUES ($1,$2,2026,'2026-01-01','2026-12-31',2,1,0,'Regras') RETURNING id_campeonato", [users[0], `Copa ${i}`]))
      phases.push(await id("INSERT INTO fase(id_campeonato,nome,ordem,tipo) VALUES ($1,'Final',1,1) RETURNING id", [cups[i]]))
    }
    const games = []
    for (let i = 0; i < 2; i++) {
      games.push(await id("INSERT INTO partida(id_campeonato,id_fase,local,data_inicio,status) VALUES ($1,$2,'Quadra','2026-11-10 18:00:00-03','agendado') RETURNING id_partida", [cups[0], phases[0]]))
      await db.query("INSERT INTO participantes VALUES ($1,$2,'A','2026-01-01')", [cups[0], teams[i]])
      await db.query("INSERT INTO grupo_partida VALUES ($1,$2,'placar')", [users[0], games[i]])
    }
    for (const user of users.slice(1)) {
      const roster = await id("INSERT INTO elenco(id_equipe,id_atleta,numero_camisa,data_inicio) VALUES ($1,$2,$3,'2026-01-01') RETURNING id_elenco", [teams[0], user, Number(user)])
      await db.query('INSERT INTO titulares VALUES ($1,$2,true)', [games[0], roster])
      await db.query("INSERT INTO avaliacao_fisica(id_atleta,impulsao,altura,peso,envergadura,forca,velocidade) VALUES ($1,40,180,75,185,50,interval '5 seconds')", [user])
    }
    assert.equal((await db.query('SELECT count(*)::int AS n FROM titulares')).rows[0].n, 3)
    assert.equal((await db.query('SELECT cpf FROM usuario ORDER BY id_usuario LIMIT 1')).rows[0].cpf, '00000000000')
    await assert.rejects(db.query("INSERT INTO participantes VALUES ($1,$2,'B','2026-01-01')", [cups[0], teams[0]]), { code: '23505' })
    await assert.rejects(db.query("INSERT INTO usuario(email,senha_hash,nome_completo,data_nascimento) VALUES ('PESSOA0@example.test','hash','Duplicado','2000-01-01')"), { code: '23505' })
    await assert.rejects(db.query('INSERT INTO tecnico VALUES (999999)'), { code: '23503' })
    await assert.rejects(db.query('UPDATE partida SET id_fase=$1 WHERE id_partida=$2', [phases[1], games[0]]), { code: '23503' })
    await assert.rejects(db.query('UPDATE partida SET placar_home=-1 WHERE id_partida=$1', [games[0]]), { code: '23514' })
    await assert.rejects(db.query("UPDATE elenco SET data_fim='2025-01-01'"), { code: '23514' })
    await assert.rejects(db.query('DELETE FROM usuario WHERE id_usuario=$1', [users[0]]), { code: '23503' })
  } finally {
    await db.close()
  }
})
