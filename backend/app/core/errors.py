# === FILE: backend/app/core/errors.py ===

class MnemosError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message = message
        self.status = status

class NotFoundError(MnemosError):
    def __init__(self, entity: str, id: str = ""):
        super().__init__(f"{entity} not found: {id}", 404)

class ValidationError(MnemosError):
    def __init__(self, detail: str):
        super().__init__(detail, 422)