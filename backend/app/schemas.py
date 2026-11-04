from datetime import date
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Id = Annotated[str, StringConstraints(min_length=1, max_length=100)]
Time = Annotated[str, StringConstraints(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')]
Category = Literal['Sub-13', 'Sub-15', 'Sub-17', 'Universitário']
Gender = Literal['Masculino', 'Feminino', 'Misto']
Action = Literal['two','three','free','miss-two','miss-three','miss-free','off-rebound','def-rebound','assist','steal','block','turnover','foul','substitution']

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')
class Login(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)
class Division(Input):
    category: Category
    gender: Gender
class NewCompetition(Input):
    name: str = Field(min_length=3, max_length=80)
    divisions: list[Division] = Field(min_length=1, max_length=12)
class Enroll(Input):
    ids: list[Id] = Field(min_length=1, max_length=200)
class NewGame(Input):
    competitionId: Id | None
    homeTeamId: Id
    awayTeamId: Id
    date: date
    time: Time
    venue: Text
class Slot(Input):
    teamId: Id
    weekday: int = Field(ge=0, le=6)
    time: Time
    venue: Text
class Cancel(Input):
    teamId: Id
    slotId: Id
    date: date
class Extra(Input):
    teamId: Id
    date: date
    time: Time
    venue: Text
    note: str | None = Field(default=None, max_length=300)
class Reschedule(Extra):
    slotId: Id
    fromDate: date
class Revision(Input):
    revision: int = Field(ge=0)
class Command(Input):
    type: Literal['play','pause','set','next-period','finish']
    seconds: int | None = Field(default=None, ge=0, le=1200)
class Control(Revision):
    command: Command
class ActionBody(Input):
    action: Action
    teamId: Id
    athleteId: Id
    outAthleteId: Id | None = None
class Record(Revision):
    input: ActionBody
class Point(Input):
    x: float = Field(ge=0, le=100, allow_inf_nan=False)
    y: float = Field(ge=0, le=100, allow_inf_nan=False)
class Player(Point):
    id: Id
    athleteId: Id
class Defender(Point):
    id: Id
class Drawing(Input):
    id: Id
    kind: Literal['move','pass','dribble','screen','freehand']
    color: Literal['ink','orange','red']
    points: list[Point] = Field(min_length=2,max_length=400)
class Board(Input):
    court: Literal['half','full']
    players: list[Player] = Field(max_length=5)
    defenders: list[Defender] = Field(max_length=5)
    showDefenders: bool
    ball: Point | None
    drawings: list[Drawing] = Field(max_length=200)
    @model_validator(mode='after')
    def unique_ids(self):
        for items, key in [(self.players,'athleteId'),(self.players,'id'),(self.defenders,'id'),(self.drawings,'id')]:
            if len({getattr(p,key) for p in items}) != len(items):
                raise ValueError('Use identificadores e atletas diferentes.')
        return self
class Draft(Input):
    playId: Id | None
    baseRevision: int | None = Field(ge=1)
    name: str = Field(max_length=80)
    kind: Literal['ataque','defesa','transicao','reposicao']
    notes: str = Field(max_length=1200)
    board: Board
