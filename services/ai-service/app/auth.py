from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str
    auth_enabled: bool


def get_current_principal(
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    x_user_id: Annotated[str | None, Header(alias="X-User-ID")] = None,
    x_user_role: Annotated[str | None, Header(alias="X-User-Role")] = None,
    settings: Settings = Depends(get_settings),
) -> Principal:
    if settings.local_api_key:
        if x_api_key != settings.local_api_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid local API key.",
            )
        return Principal(
            user_id=x_user_id or "local-user",
            role=x_user_role or settings.local_default_role,
            auth_enabled=True,
        )

    return Principal(
        user_id=x_user_id or "local-dev",
        role=x_user_role or settings.local_default_role,
        auth_enabled=False,
    )


def require_roles(*roles: str) -> Callable[[Principal], Principal]:
    allowed = set(roles)

    def dependency(principal: Principal = Depends(get_current_principal)) -> Principal:
        if principal.auth_enabled and principal.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{principal.role}' is not allowed for this operation.",
            )
        return principal

    return dependency


def can_access_owner(principal: Principal, owner_user_id: str | None) -> bool:
    if not principal.auth_enabled:
        return True
    if principal.role in {"admin", "reviewer", "worker"}:
        return True
    return bool(owner_user_id and owner_user_id == principal.user_id)


def ensure_owner_access(
    principal: Principal,
    owner_user_id: str | None,
    *,
    resource_name: str = "resource",
) -> None:
    if can_access_owner(principal, owner_user_id):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"You do not have access to this {resource_name}.",
    )
