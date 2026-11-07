// "Today" is the calendar date in Asia/Bangkok, whatever the server's TZ (SRS A-02).
const bangkokDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's Asia/Bangkok date as `YYYY-MM-DD`. */
export function todayInBangkok(now: Date = new Date()): string {
  return bangkokDate.format(now);
}
