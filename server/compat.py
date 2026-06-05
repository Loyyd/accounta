import sys

from time_utils import utcnow as default_utcnow


def _app_module():
    return sys.modules.get("app") or sys.modules.get("__main__")


def utcnow():
    module = _app_module()
    if module is not None and hasattr(module, "utcnow"):
        return module.utcnow()
    return default_utcnow()


def verify_google_credential(credential):
    module = _app_module()
    if module is not None and hasattr(module, "verify_google_credential"):
        return module.verify_google_credential(credential)
    from auth import verify_google_credential as default_verify_google_credential

    return default_verify_google_credential(credential)
