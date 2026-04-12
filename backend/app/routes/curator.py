from fastapi import APIRouter
from app.models.schemas import CuratorAction
from app.services.curator import curator

router = APIRouter()


@router.post("/curator/scan")
async def curator_scan():
    report = await curator.full_scan()
    return report


@router.post("/curator/apply")
async def curator_apply(payload: CuratorAction):
    result = await curator.apply_action(
        action_type=payload.action_type,
        params=payload.params,
    )
    return result