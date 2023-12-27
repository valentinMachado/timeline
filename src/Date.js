import { numberToLabel } from './utils';

export const MIN_CHUNK_YEARS = 1000000000; // min chunk years is the minimum precision the timeline can be display min and max year should multiple
export const MIN_YEAR = -14 * MIN_CHUNK_YEARS; // approximatly bing bang
export const MAX_YEAR = MIN_CHUNK_YEARS; // minimum chunk to wrap today

export class TimelineDate {
  constructor(year = 0, month = 0, day = 1) {
    this.year = parseInt(year);
    this.month = parseInt(month);
    this.day = parseInt(day);

    TimelineDate.assert(this);
  }

  set(year, month = 0, day = 1) {
    this.year = parseInt(year);
    this.month = parseInt(month);
    this.day = parseInt(day);
    return TimelineDate.assert(this);
  }

  copy(timelineDate) {
    this.day = timelineDate.day;
    this.month = timelineDate.month;
    this.year = timelineDate.year;
    return TimelineDate.assert(this);
  }

  equals(timelineDate) {
    return (
      this.day == timelineDate.day &&
      this.year == timelineDate.year &&
      this.month == timelineDate.month
    );
  }

  isAfter(timelineDate) {
    if (this.equals(timelineDate)) return false;
    if (this.year != timelineDate.year) {
      return this.year > timelineDate.year;
    } else {
      // year are equals
      if (this.month != timelineDate.month) {
        return this.month > timelineDate.month;
      } else {
        // month are equals
        return this.day > timelineDate.day; // day cant be equal
      }
    }
  }

  isBefore(timelineDate) {
    if (this.equals(timelineDate)) return false;
    return !this.isAfter(timelineDate);
  }

  /**
   *
   * @param {TimelineDate} timelineDate
   * @returns
   */
  diff(timelineDate) {
    if (this.equals(timelineDate)) return 0;

    const minDate = TimelineDate.min(this, timelineDate);
    const maxDate = TimelineDate.max(this, timelineDate);

    let result = 0;

    if (minDate.year == maxDate.year) {
      // same year
      if (minDate.month == maxDate.month) return maxDate.day - minDate.day; // same month

      // month are different

      // fill minDate month
      result +=
        TimelineDate.monthDayCount(minDate.year, minDate.month) - minDate.day;

      // fill months separating min date month + 1 (cant be december) => max date month -1
      for (let month = minDate.month + 1; month < maxDate.month; month++) {
        result += TimelineDate.monthDayCount(minDate.year, month);
      }

      // fill maxDate month
      result += maxDate.day;
    } else {
      // year are different

      // fill minDate year

      // fill min date month
      result +=
        TimelineDate.monthDayCount(minDate.year, minDate.month) - minDate.day;

      // add remaining month if there is some => min date month is not december
      for (let month = minDate.month + 1; month < 12; month++) {
        result += TimelineDate.monthDayCount(minDate.year, month);
      }

      // fill till 31 december of min date

      // add remaining years between min date year + 1 and max date year -1

      // add year 400 by 400 if there is enough (opti)
      const diffYear = Math.max(maxDate.year - minDate.year - 2, 0); // minus 2 because min date year + 1 and max date year -1
      const fourHundredYearCount = Math.floor(diffYear / 400);
      result += fourHundredYearCount * TimelineDate.FOUR_HUNDRED_YEAR_DAY_COUNT;

      // add ones remaining
      for (
        let year = minDate.year + 1 + fourHundredYearCount * 400;
        year < maxDate.year;
        year++
      )
        result += TimelineDate.yearDayCount(year);

      // fill max date year

      // fill month from 0 => max date month - 1
      for (let month = 0; month < maxDate.month; month++)
        result += TimelineDate.monthDayCount(maxDate.year, month);

      // fill max date month
      result += maxDate.day;
    }

    return result;
  }

  clone() {
    return new TimelineDate(this.year, this.month, this.day);
  }

  add(dayCount) {
    if (!dayCount) return TimelineDate.assert(this); // no days to add
    /**
     *
     * @returns {boolean} true meaning there are still days to add
     */
    const fillMonth = () => {
      // fill month
      const dayMissingInMonth =
        TimelineDate.monthDayCount(this.year, this.month) - this.day;
      if (dayMissingInMonth) {
        if (dayCount <= dayMissingInMonth) {
          // filling this month and done
          this.day += dayCount;
          return false; // add finished
        } else {
          // add these missing days
          this.day += dayMissingInMonth;
          dayCount -= dayMissingInMonth; // > 0 with the previous condition
        }
      }
      // month filled and still days to add
      if (this.month < 11) {
        // no december
        this.month++;
      } else {
        this.month = 0;
        this.year++;
      }
      this.day = 1;
      dayCount--;

      return dayCount > 0; // they are still days to add
    };
    if (!fillMonth()) return TimelineDate.assert(this); // no more days

    // there are still days to add

    // fill this.year
    for (let month = this.month; month < 12; month++) {
      // fill month
      if (!fillMonth()) return TimelineDate.assert(this);
    }

    // year filled and still days to add
    if (this.month != 0 || this.day != 1 || dayCount <= 0)
      throw new Error('year not filled properly');

    // add as many 400 years as possible
    const fourHundredYearCount = Math.floor(
      dayCount / TimelineDate.FOUR_HUNDRED_YEAR_DAY_COUNT
    );
    this.year += fourHundredYearCount * 400;
    dayCount -= fourHundredYearCount * TimelineDate.FOUR_HUNDRED_YEAR_DAY_COUNT;

    // add rest of years as possible
    let currentYearDayCount = TimelineDate.yearDayCount(this.year);
    while (dayCount >= currentYearDayCount) {
      dayCount -= currentYearDayCount;
      this.year++;
      currentYearDayCount = TimelineDate.yearDayCount(this.year);
    }

    if (dayCount == 0) return TimelineDate.assert(this); // no more days

    // year filled and still days to add but less than the current year day count
    if (this.month != 0 || this.day != 1 || dayCount >= currentYearDayCount)
      throw new Error('year not filled properly');

    // fill this.year
    for (let month = 0; month < 12; month++) {
      // fill month
      if (!fillMonth()) return TimelineDate.assert(this);
    }

    throw new Error('fill month above should return at a moment');
  }

  toNextMonth() {
    this.month++;
    this.day = 1;
    if (this.month > 11) {
      this.month = 0;
      this.year++;
    }
    if (this.isAfter(TimelineDate.MAX_TIMELINE_DATE))
      this.copy(TimelineDate.MAX_TIMELINE_DATE); // cap

    return TimelineDate.assert(this);
  }

  dayCountToNextMonth() {
    return TimelineDate.monthDayCount(this.year, this.month) - this.day + 1;
  }

  toNextYears(precision) {
    this.day = 1;
    this.month = 0;
    this.year += precision;

    if (this.isAfter(TimelineDate.MAX_TIMELINE_DATE))
      this.copy(TimelineDate.MAX_TIMELINE_DATE); // cap

    return TimelineDate.assert(this);
  }

  dayCountToNextYears(precision) {
    const endDate = this.clone().toNextYears(precision);
    return endDate.diff(this);
  }

  /** TODO make this generic */
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

  clamp(min, max) {
    if (this.isBefore(min)) {
      this.copy(min);
    } else if (this.isAfter(max)) {
      this.copy(max);
    }

    return TimelineDate.assert(this);
  }

  static magnetizeDay(day, month, year) {
    return Math.max(Math.min(day, TimelineDate.monthDayCount(year, month)), 1);
  }

  static magnetizeMonth(month) {
    return Math.max(Math.min(11, month), 0);
  }

  static magnetizeYear(year) {
    return Math.max(Math.min(year, MAX_YEAR), MIN_YEAR);
  }

  toString() {
    return (
      this.day +
      ' ' +
      TimelineDate.monthToString(this.month) +
      ' ' +
      numberToLabel(this.year)
    );
  }

  static min(a, b) {
    return a.isBefore(b) ? a : b;
  }

  static max(a, b) {
    return a.isAfter(b) ? a : b;
  }

  static assertYear(year) {
    return year <= MAX_YEAR && year >= MIN_YEAR;
  }

  static assertMonth(month) {
    return month >= 0 && month < 12;
  }

  static assertDay(day) {
    return day >= 1 && day <= 31;
  }

  /**
   *
   * @param {TimelineDate} date
   * @returns {boolean}
   */
  static assert(date) {
    if (
      !(
        TimelineDate.assertDay(date.day) &&
        TimelineDate.assertMonth(date.month) &&
        TimelineDate.assertYear(date.year)
      )
    ) {
      console.log(date.toString());
      console.error(date, 'is not a valid time line date');
    } else {
      return date;
    }
  }

  // ref: https://www.epochconverter.com/years
  // Leap years: Every year that is divisible by four is a leap year, except for years that are divisible by 100, but not by 400.
  static yearIsLeap(year) {
    if (year % 100 == 0 && year % 400 != 0) {
      return false;
    }
    return year % 4 == 0;
  }

  static monthToString(month) {
    return TimelineDate.MONTHS[month];
  }

  static stringToMonth(str) {
    return TimelineDate.MONTHS.indexOf(str);
  }

  static yearDayCount(year) {
    if (TimelineDate.yearIsLeap(year)) {
      return 366;
    } else {
      return 365;
    }
  }

  static get FOUR_HUNDRED_YEAR_DAY_COUNT() {
    return 146097; // day count in 400 year is constant
  }

  static monthDayCount(year, month) {
    if (month % 2) {
      if (month == 1) {
        // february
        return TimelineDate.yearIsLeap(year) ? 29 : 28;
      } else if (month <= 5) {
        // april/3, june/5
        return 30;
      } else {
        // august / 7, october / 9, december / 11;
        return 31;
      }
    } else {
      if (month <= 6) {
        // january/0, marth/2, may/4, july/6
        return 31;
      } else {
        // september/8, november/10
        return 30;
      }
    }
  }

  static get LARGER_MONTH_STRING() {
    return 'Septembre';
  }

  static get LARGER_MONTH_DAY_COUNT() {
    return 31;
  }

  static get LARGER_YEAR_DAY_COUNT() {
    return 366;
  }
}

TimelineDate.MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];
TimelineDate.MAX_TIMELINE_DATE = new TimelineDate(MAX_YEAR);
TimelineDate.MIN_TIMELINE_DATE = new TimelineDate(MIN_YEAR);
