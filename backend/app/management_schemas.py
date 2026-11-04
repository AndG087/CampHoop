from datetime import date as Date
from pydantic import Field, HttpUrl, model_validator
from .schemas import Input, Id, Category, Gender
from typing import Literal

class LocalClub(Input):
    name:str=Field(min_length=2,max_length=150)
    shortName:str=Field(min_length=1,max_length=12)
    city:str=Field(min_length=2,max_length=100)

class TeamDetails(Input):
    name:str=Field(min_length=2,max_length=100)
    category:Category
    gender:Gender
    coach:str=Field(min_length=2,max_length=120)

class NewTeam(TeamDetails):
    season:str
    clubId:Id|None=None
    club:LocalClub|None=None
    makeActive:bool=True
    @model_validator(mode='after')
    def one_club(self):
        if (self.clubId is None)==(self.club is None):raise ValueError('Escolha um clube próprio ou cadastre um novo clube.')
        return self

class EditTeam(TeamDetails):
    revision:int=Field(ge=1)

class NewTeamSeason(TeamDetails):
    sourceSeason:str
    targetSeason:str
    copyRoster:bool=True

class AthleteDetails(Input):
    teamId:Id
    name:str=Field(min_length=2,max_length=150)
    number:int|None=Field(default=None,ge=0,le=99)
    position:str=Field(min_length=2,max_length=80)
    birthDate:Date|None=None
    heightCm:int|None=Field(default=None,ge=60,le=250)
    memberSince:str|None=Field(default=None,pattern=r'^(19|20)\d{2}-(0[1-9]|1[0-2])$')
    photoUrl:HttpUrl|None=None
    status:Literal['ativo','lesionado','afastado']='ativo'

class NewAthlete(AthleteDetails):
    season:str

class EditAthlete(AthleteDetails):
    revision:int=Field(ge=1)

class LinkAthlete(Input):
    athleteId:Id
    teamId:Id
    season:str
    number:int|None=Field(default=None,ge=0,le=99)
    position:str=Field(min_length=2,max_length=80)

class ActiveTeam(Input):
    teamId:Id

class CoachAccess(Input):
    email:str=Field(min_length=3,max_length=254)

class Authorization(Input):
    season:str
    kind:Literal['friendly','enroll']
    opponentId:Id|None=None
    date:Date|None=None
    competitionId:Id|None=None

class DeleteRecord(Input):
    revision:int=Field(ge=1)
