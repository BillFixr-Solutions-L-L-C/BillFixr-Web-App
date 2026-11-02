from app.privacy import redact_phi


def test_redact_phi_masks_common_identifiers() -> None:
    payload = {
        "email": "patient@example.com",
        "phone": "720-777-6422",
        "account": "555555555",
        "safe": "hospital bill",
    }

    assert redact_phi(payload) == {
        "email": "[redacted-email]",
        "phone": "[redacted-phone]",
        "account": "[redacted-number]",
        "safe": "hospital bill",
    }
