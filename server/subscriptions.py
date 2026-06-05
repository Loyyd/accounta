import calendar
import datetime as dt

import compat
from extensions import db
from models import Entry, Subscription


def add_months(value, months, anchor_day):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(anchor_day, calendar.monthrange(year, month)[1])
    return dt.date(year, month, day)


def add_years(value, years, anchor_month, anchor_day):
    year = value.year + years
    day = min(anchor_day, calendar.monthrange(year, anchor_month)[1])
    return dt.date(year, anchor_month, day)


def get_next_occurrence_date(current_date, subscription):
    if subscription.frequency == "weekly":
        return current_date + dt.timedelta(days=7)
    if subscription.frequency == "monthly":
        return add_months(current_date, 1, subscription.start_date.day)
    if subscription.frequency == "yearly":
        return add_years(current_date, 1, subscription.start_date.month, subscription.start_date.day)
    raise ValueError("invalid subscription frequency")


def iter_subscription_occurrences(subscription, today=None):
    current_date = subscription.start_date
    final_date = today or compat.utcnow().date()

    while current_date <= final_date:
        yield current_date
        current_date = get_next_occurrence_date(current_date, subscription)


def subscription_entry_exists(subscription, occurrence_date):
    occurrence_datetime = dt.datetime.combine(occurrence_date, dt.time.min)
    return (
        Entry.query.filter_by(
            user_id=subscription.user_id,
            type=subscription.type,
            description=subscription.description,
            amount=subscription.amount,
            category=subscription.category,
            date=occurrence_datetime,
        ).first()
        is not None
    )


def sync_user_subscriptions_for_user(user_id, today=None):
    subscriptions = Subscription.query.filter_by(user_id=user_id, active=True).all()
    if not subscriptions:
        return 0

    created_entries = 0
    final_date = today or compat.utcnow().date()

    for subscription in subscriptions:
        if subscription.start_date > final_date:
            continue

        for occurrence_date in iter_subscription_occurrences(subscription, today=final_date):
            if subscription_entry_exists(subscription, occurrence_date):
                continue

            db.session.add(
                Entry(
                    user_id=subscription.user_id,
                    type=subscription.type,
                    description=subscription.description,
                    amount=subscription.amount,
                    category=subscription.category,
                    date=dt.datetime.combine(occurrence_date, dt.time.min),
                )
            )
            created_entries += 1

    if created_entries:
        db.session.commit()

    return created_entries
