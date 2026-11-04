import re
from typing import Literal
from pydantic import Field, field_validator
from .schemas import Input, Id

class EmailInput(Input):
    email:str=Field(min_length=3,max_length=254)
    @field_validator('email')
    @classmethod
    def valid_email(cls,value):
        value=value.strip().lower()
        if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',value) or '\r' in value or '\n' in value:raise ValueError('Informe um e-mail válido.')
        return value

class Register(EmailInput):
    name:str=Field(min_length=2,max_length=120)
    password:str=Field(min_length=12,max_length=128)

class TokenInput(Input):
    token:str=Field(min_length=20,max_length=200)

class ResetPassword(TokenInput):
    password:str=Field(min_length=12,max_length=128)

class NewClub(Input):
    name:str=Field(min_length=2,max_length=150)
    shortName:str=Field(min_length=1,max_length=12)
    city:str=Field(min_length=2,max_length=100)

class Invite(EmailInput):
    role:Literal['tecnico','atleta','estatistico','organizador','basico']
    teamId:Id|None=None
    athleteId:Id|None=None

class MemberTeam(Input):
    teamId:Id|None=None
    athleteId:Id|None=None

class AcceptInvitation(Input):
    token:str|None=Field(default=None,min_length=20,max_length=200)
    invitationId:Id|None=None

class Preferences(Input):
    emailNotifications:bool
