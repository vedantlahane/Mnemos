# === FILE: backend/app/routes/curator.py ===

from fastapi import APIRouter, Depends
from app.models.schemas import CuratorAction
from app.services.curator import curator
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.post("/curator/scan")
async def curator_scan(user_id: str = Depends(get_optional_user_id)):
    report = await curator.full_scan(user_id=user_id)
    return report


@router.post("/curator/apply")
async def curator_apply(payload: CuratorAction, user_id: str = Depends(get_optional_user_id)):
    result = await curator.apply_action(
        action_type=payload.action_type,
        params=payload.params,
        user_id=user_id,
    )
    return result