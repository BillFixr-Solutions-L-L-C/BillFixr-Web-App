"""
Fee rules for BillFixr.

The engine does not take payments. The web app charges the client (Stripe) and tells the engine it was paid.
These values are defaults. The web app can pass its own completion fee rate for each case, for example from
its admin pricing settings, and the engine uses that instead.
"""

import math
import os
from typing import Optional

# Charged once, before the audit runs. Fixed, not tied to the bill.
COMMITMENT_FEE = float(os.getenv("COMMITMENT_FEE", "20"))

# Charged when the hospital has sent the revised bill: a share of savings, rounded up to the next dollar.
COMPLETION_FEE_RATE = float(os.getenv("COMPLETION_FEE_RATE", "0.10"))


def savings_amount(total_billed: float, settled_amount: float) -> float:
    """Savings = original billed charges minus the amount the hospital accepted."""
    return round(max(0.0, float(total_billed) - float(settled_amount)), 2)


def completion_fee(total_billed: float, settled_amount: float, rate: Optional[float] = None) -> float:
    """Completion fee = a share of savings (default 10%), rounded up to the next whole dollar."""
    savings = savings_amount(total_billed, settled_amount)
    applied_rate = COMPLETION_FEE_RATE if rate is None else float(rate)
    # Round to cents before ceiling so float noise (e.g. 20.000000000000004) doesn't add a dollar.
    return float(math.ceil(round(savings * applied_rate, 2)))
