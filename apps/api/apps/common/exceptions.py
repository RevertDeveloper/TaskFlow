class DomainError(Exception):
    """Base exception for application-facing domain failures."""


class ResourceNotFound(DomainError):
    """Raised when a resource is absent or owned by another user."""


class ProtectedResourceError(DomainError):
    """Raised when a system resource cannot be changed by a regular operation."""
