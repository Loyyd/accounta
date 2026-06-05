import datetime as dt


def utcnow():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0, tzinfo=None)
