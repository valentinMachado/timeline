/**
 * The coarsest step, in years, the timeline is cut into. The bounds below are
 * whole multiples of it so a step never straddles one of them.
 */
export const MIN_CHUNK_YEARS = 1000000000;

/** Roughly the Big Bang: the earliest date a timeline may hold. */
export const MIN_YEAR = -14 * MIN_CHUNK_YEARS;

/** One chunk past year 0, so the present always fits. */
export const MAX_YEAR = MIN_CHUNK_YEARS;

/** Days in any 400 consecutive Gregorian years, leap rules included. */
const FOUR_HUNDRED_YEAR_DAY_COUNT = 146097;

/**
 * A day on the proleptic Gregorian calendar, from the Big Bang to a billion
 * years ahead. `Date` stops at ±273,790 years, which a page about geology or
 * cosmology overruns, so the arithmetic is done here on plain integers.
 *
 * Years are astronomical: year 0 is 1 BC, year -1 is 2 BC. Months are 0-based
 * like `Date`'s, days 1-based. Every mutating method returns `this`, so calls
 * chain (`date.clone().add(30)`).
 */
export class TimelineDate {
  /**
   * @param {number} [year] - astronomical year, an integer
   * @param {number} [month] - 0 (January) to 11 (December)
   * @param {number} [day] - 1 to the month's day count
   * @throws {RangeError} when the date is not a valid timeline date
   */
  constructor(year = 0, month = 0, day = 1) {
    this.year = year;
    this.month = month;
    this.day = day;
    TimelineDate.assert(this);
  }

  /**
   * @param {number} year
   * @param {number} [month]
   * @param {number} [day]
   * @returns {TimelineDate} this
   */
  set(year, month = 0, day = 1) {
    this.year = year;
    this.month = month;
    this.day = day;
    return TimelineDate.assert(this);
  }

  /**
   * @param {TimelineDate} other
   * @returns {TimelineDate} this
   */
  copy(other) {
    this.year = other.year;
    this.month = other.month;
    this.day = other.day;
    return TimelineDate.assert(this);
  }

  /** @returns {TimelineDate} a new date on the same day */
  clone() {
    return new TimelineDate(this.year, this.month, this.day);
  }

  /**
   * @param {TimelineDate} other
   * @returns {boolean}
   */
  equals(other) {
    return (
      this.year === other.year &&
      this.month === other.month &&
      this.day === other.day
    );
  }

  /**
   * @param {TimelineDate} other
   * @returns {boolean} true when this day comes strictly after `other`
   */
  isAfter(other) {
    if (this.year !== other.year) return this.year > other.year;
    if (this.month !== other.month) return this.month > other.month;
    return this.day > other.day;
  }

  /**
   * @param {TimelineDate} other
   * @returns {boolean} true when this day comes strictly before `other`
   */
  isBefore(other) {
    return other.isAfter(this);
  }

  /**
   * The number of days between two dates, whichever comes first.
   *
   * @param {TimelineDate} other
   * @returns {number} a non-negative day count
   */
  diff(other) {
    if (this.equals(other)) return 0;

    const min = TimelineDate.min(this, other);
    const max = TimelineDate.max(this, other);

    if (min.year === max.year) {
      if (min.month === max.month) return max.day - min.day;

      let result = TimelineDate.monthDayCount(min.year, min.month) - min.day;
      for (let month = min.month + 1; month < max.month; month++) {
        result += TimelineDate.monthDayCount(min.year, month);
      }
      return result + max.day;
    }

    // To the end of min's year.
    let result = TimelineDate.monthDayCount(min.year, min.month) - min.day;
    for (let month = min.month + 1; month < 12; month++) {
      result += TimelineDate.monthDayCount(min.year, month);
    }

    // The whole years in between, 400 at a time while there are that many.
    const wholeYears = Math.max(max.year - min.year - 2, 0);
    const fourHundreds = Math.floor(wholeYears / 400);
    result += fourHundreds * FOUR_HUNDRED_YEAR_DAY_COUNT;
    for (
      let year = min.year + 1 + fourHundreds * 400;
      year < max.year;
      year++
    ) {
      result += TimelineDate.yearDayCount(year);
    }

    // From the start of max's year.
    for (let month = 0; month < max.month; month++) {
      result += TimelineDate.monthDayCount(max.year, month);
    }
    return result + max.day;
  }

  /**
   * Moves this date forward by a number of days.
   *
   * @param {number} dayCount - a non-negative integer
   * @returns {TimelineDate} this
   * @throws {RangeError} on a negative count, or past {@link MAX_YEAR}
   */
  add(dayCount) {
    if (dayCount < 0) throw new RangeError("add() takes a non-negative count");
    if (!dayCount) return TimelineDate.assert(this);

    /**
     * Fills the current month, then steps onto the first of the next one.
     *
     * @returns {boolean} true while days are left to add
     */
    const fillMonth = () => {
      const missing =
        TimelineDate.monthDayCount(this.year, this.month) - this.day;
      if (dayCount <= missing) {
        this.day += dayCount;
        dayCount = 0;
        return false;
      }
      dayCount -= missing + 1;
      if (this.month < 11) {
        this.month++;
      } else {
        this.month = 0;
        this.year++;
      }
      this.day = 1;
      return dayCount > 0;
    };

    // To the first of January of the next year, or done before it.
    while (this.month !== 0 || this.day !== 1) {
      if (!fillMonth()) return TimelineDate.assert(this);
    }

    const fourHundreds = Math.floor(dayCount / FOUR_HUNDRED_YEAR_DAY_COUNT);
    this.year += fourHundreds * 400;
    dayCount -= fourHundreds * FOUR_HUNDRED_YEAR_DAY_COUNT;

    while (dayCount >= TimelineDate.yearDayCount(this.year)) {
      dayCount -= TimelineDate.yearDayCount(this.year);
      this.year++;
    }

    while (dayCount > 0) fillMonth();
    return TimelineDate.assert(this);
  }

  /**
   * Moves this date back by one day.
   *
   * @returns {TimelineDate} this
   */
  subDay() {
    this.day--;
    if (this.day < 1) {
      this.month--;
      if (this.month < 0) {
        this.year--;
        this.month = 11;
      }
      this.day = TimelineDate.monthDayCount(this.year, this.month);
    }
    return TimelineDate.assert(this);
  }

  /**
   * Moves to the first of the next month, capped at the timeline's end.
   *
   * @returns {TimelineDate} this
   */
  toNextMonth() {
    this.day = 1;
    this.month++;
    if (this.month > 11) {
      this.month = 0;
      this.year++;
    }
    if (this.isAfter(TimelineDate.MAX_TIMELINE_DATE)) {
      this.copy(TimelineDate.MAX_TIMELINE_DATE);
    }
    return TimelineDate.assert(this);
  }

  /** @returns {number} days from this date to the first of the next month */
  dayCountToNextMonth() {
    return TimelineDate.monthDayCount(this.year, this.month) - this.day + 1;
  }

  /**
   * Moves to the first of January `step` years later, capped at the
   * timeline's end.
   *
   * @param {number} step - years to move by
   * @returns {TimelineDate} this
   */
  toNextYears(step) {
    this.day = 1;
    this.month = 0;
    this.year += step;
    if (this.isAfter(TimelineDate.MAX_TIMELINE_DATE)) {
      this.copy(TimelineDate.MAX_TIMELINE_DATE);
    }
    return TimelineDate.assert(this);
  }

  /**
   * @param {number} step - years to move by
   * @returns {number} days from this date to where {@link toNextYears} lands
   */
  dayCountToNextYears(step) {
    return this.clone().toNextYears(step).diff(this);
  }

  /**
   * @param {TimelineDate} min
   * @param {TimelineDate} max
   * @returns {TimelineDate} this, moved inside [min, max]
   */
  clamp(min, max) {
    if (this.isBefore(min)) this.copy(min);
    else if (this.isAfter(max)) this.copy(max);
    return TimelineDate.assert(this);
  }

  /** @returns {string} `year-MM-DD`, for logs and test messages, never the UI */
  toString() {
    const pad = (number) => String(number).padStart(2, "0");
    return `${this.year}-${pad(this.month + 1)}-${pad(this.day)}`;
  }

  /**
   * @param {TimelineDate} a
   * @param {TimelineDate} b
   * @returns {TimelineDate} the earlier of the two
   */
  static min(a, b) {
    return a.isBefore(b) ? a : b;
  }

  /**
   * @param {TimelineDate} a
   * @param {TimelineDate} b
   * @returns {TimelineDate} the later of the two
   */
  static max(a, b) {
    return a.isAfter(b) ? a : b;
  }

  /**
   * @param {TimelineDate} date
   * @returns {TimelineDate} the same date, once checked
   * @throws {RangeError} when a field is not an integer in range
   */
  static assert(date) {
    const { year, month, day } = date;
    const valid =
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day) &&
      year >= MIN_YEAR &&
      year <= MAX_YEAR &&
      month >= 0 &&
      month <= 11 &&
      day >= 1 &&
      day <= TimelineDate.monthDayCount(year, month);
    if (!valid) {
      throw new RangeError(`${date} is not a valid timeline date`);
    }
    return date;
  }

  /**
   * Gregorian leap rule: every fourth year, but not centuries, but every
   * fourth century.
   *
   * @param {number} year - astronomical year
   * @returns {boolean}
   */
  static yearIsLeap(year) {
    if (year % 100 === 0 && year % 400 !== 0) return false;
    return year % 4 === 0;
  }

  /**
   * @param {number} year
   * @returns {number} 365 or 366
   */
  static yearDayCount(year) {
    return TimelineDate.yearIsLeap(year) ? 366 : 365;
  }

  /**
   * @param {number} year
   * @param {number} month - 0 to 11
   * @returns {number} 28 to 31
   */
  static monthDayCount(year, month) {
    if (month === 1) return TimelineDate.yearIsLeap(year) ? 29 : 28;
    return MONTH_DAY_COUNTS[month];
  }
}

/** Day counts of a common year; February is read from the leap rule. */
const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The timeline's last day, the first of January of {@link MAX_YEAR}. */
TimelineDate.MAX_TIMELINE_DATE = new TimelineDate(MAX_YEAR);

/** The timeline's first day, the first of January of {@link MIN_YEAR}. */
TimelineDate.MIN_TIMELINE_DATE = new TimelineDate(MIN_YEAR);
