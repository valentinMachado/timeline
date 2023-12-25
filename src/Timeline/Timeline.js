import { localStorageFloat, numberEquals, numberToLabel } from '../utils';
import './timeline.css';

const MIN_CHUNK_YEARS = 1000000000; // min chunk years is the minimum precision the timeline can be display min and max year should multiple
const MIN_YEAR = -14 * MIN_CHUNK_YEARS; // approximatly bing bang
const MAX_YEAR = MIN_CHUNK_YEARS; // minimum chunk to wrap today

export class TimelineDate {
  constructor(year, month = 0, day = 1) {
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
    let minDate, maxDate;
    if (this.isAfter(timelineDate)) {
      minDate = timelineDate;
      maxDate = this;
    } else {
      minDate = this;
      maxDate = timelineDate;
    }

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

  toString() {
    return (
      this.day +
      ' ' +
      TimelineDate.monthToString(this.month) +
      ' ' +
      numberToLabel(this.year)
    );
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
    switch (month) {
      case 0:
        return 'Janvier';
      case 1:
        return 'Février';
      case 2:
        return 'Mars';
      case 3:
        return 'Avril';
      case 4:
        return 'Mai';
      case 5:
        return 'Juin';
      case 6:
        return 'Juillet';
      case 7:
        return 'Août';
      case 8:
        return 'Septembre';
      case 9:
        return 'Octobre';
      case 10:
        return 'Novembre';
      case 11:
        return 'Décembre';
      default:
        throw 'Wrong month';
    }
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

TimelineDate.MAX_TIMELINE_DATE = new TimelineDate(MAX_YEAR);
TimelineDate.MIN_TIMELINE_DATE = new TimelineDate(MIN_YEAR);

export class Timeline extends HTMLDivElement {
  constructor() {
    super();

    // css
    this.classList.add('timeline');

    /** @type {HTMLCanvasElement} */
    this.canvas = document.createElement('canvas');
    this.appendChild(this.canvas);
    // full screen TODO : should be configurable
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight * 0.3;

    // TODO : do not record in window
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight * 0.3;
      this.update();
    });

    this.totalDayCount = TimelineDate.MAX_TIMELINE_DATE.diff(
      TimelineDate.MIN_TIMELINE_DATE
    ); // number of day between min and max
    console.info('total days = ' + this.totalDayCount);
    if (this.totalDayCount > Number.MAX_SAFE_INTEGER)
      console.warn('total day count overflow');

    this.minDayWidth = window.innerWidth / this.totalDayCount; // minScale=1 shows between minDate and maxDate
    if (this.minDayWidth < Number.EPSILON)
      console.warn('min day width overflow');

    this.maxScale = window.innerWidth / this.minDayWidth; // day width cant be superior window.innerWidth

    this._scale = localStorageFloat('timeline_scale', () => {
      return this.scale;
    });
    if (this.scale == null) this.scale = 1;
    this.translation =
      localStorageFloat('timeline_translation', () => {
        return this.translation;
      }) || 0;

    //DEBUG
    // this.scale = 1;
    // this.translation = 0;

    this.canvas.addEventListener('wheel', (event) => {
      const worldX = (event.clientX - this.translation) / this.scale;
      this.scale *= -Math.abs(event.deltaY) / event.deltaY > 0 ? 2 : 0.5;
      this.translation = -(worldX * this.scale - event.clientX);
      this.update();
    });

    let isDragging = false;
    let startTranslation = 0;

    this.canvas.addEventListener('mousedown', (event) => {
      isDragging = true;
      startTranslation = event.clientX - this.translation;
    });

    this.canvas.addEventListener('mousemove', (event) => {
      if (isDragging) {
        this.translation = event.clientX - startTranslation;
        this.update();
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    this.update();
  }

  drawCanvas() {
    console.time('draw canvas');

    const context = this.canvas.getContext('2d');
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // compute min and max date on screen
    const minDateOnScreen = TimelineDate.MIN_TIMELINE_DATE.clone().add(
      Math.floor(-this.translation / this.dayWidth)
    );
    const maxDateOnScreen = minDateOnScreen
      .clone()
      .add(Math.ceil(window.innerWidth / this.dayWidth));

    console.log(
      'draw between',
      minDateOnScreen.toString(),
      maxDateOnScreen.toString()
    );

    const xMinDate =
      Math.floor(-this.translation / this.dayWidth) * this.dayWidth;

    let maxPrecision = MIN_CHUNK_YEARS;

    while (
      maxPrecision * TimelineDate.LARGER_YEAR_DAY_COUNT * this.dayWidth >
      this.canvas.width
    ) {
      maxPrecision = Math.max(Math.round(maxPrecision * 0.1), 1);
      if (numberEquals(maxPrecision, 1)) break;
    }

    if (numberEquals(maxPrecision, 1)) {
      // draw year by year
      if (
        this.dayWidth * TimelineDate.LARGER_YEAR_DAY_COUNT <
        this.canvas.width
      ) {
        // a year is inferior to canvas width => draw year and month
        this.drawCanvasYears(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          0,
          this.canvas.height * 0.5,
          1
        );
        this.drawCanvasMonths(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          this.canvas.height * 0.5,
          this.canvas.height
        );
      } else {
        // a year is superior to canvas width => draw year, month and days
        this.drawCanvasYears(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          0,
          this.canvas.height * 0.3,
          1
        );
        this.drawCanvasMonths(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          this.canvas.height * 0.3,
          this.canvas.height * 0.6
        );
        this.drawCanvasDays(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          this.canvas.height * 0.6,
          this.canvas.height
        );
      }
    } else {
      this.drawCanvasYears(
        minDateOnScreen,
        maxDateOnScreen,
        xMinDate,
        0,
        this.canvas.height * 0.5,
        maxPrecision
      );

      this.drawCanvasYears(
        minDateOnScreen,
        maxDateOnScreen,
        xMinDate,
        this.canvas.height * 0.5,
        this.canvas.height,
        maxPrecision * 0.1
      );
    }

    console.timeEnd('draw canvas');
  }

  drawCanvasDays(minDate, maxDate, xMinDate, yMin, yMax) {
    const context = this.canvas.getContext('2d');

    context.font = Math.min(this.dayWidth * 0.5, yMax - yMin) + "px 'Segoe UI'";

    let cursor = xMinDate;
    context.beginPath();
    context.moveTo(cursor + this.translation, 0);

    for (let year = minDate.year; year <= maxDate.year; year++) {
      for (let month = 0; month < 12; month++) {
        if (year == minDate.year && month < minDate.month) {
          continue; // cursor is initialized with minDate
        }

        if (year == maxDate.year && month > maxDate.month) break;

        for (
          let day = 1;
          day <= TimelineDate.monthDayCount(year, month);
          day++
        ) {
          if (
            year == minDate.year &&
            month == minDate.month &&
            day < minDate.day
          ) {
            continue; // cursor is initialized with minDate
          }

          if (
            year == maxDate.year &&
            month == maxDate.month &&
            day > maxDate.day
          )
            break;

          context.fillText(day, cursor + this.translation, yMax);
          context.lineTo(cursor + this.translation, yMin);
          context.lineTo(cursor + this.translation, yMax);
          cursor += this.dayWidth;
          context.lineTo(cursor + this.translation, yMax);
        }
      }
    }

    context.lineTo(xMinDate, yMax);
    context.closePath();
    context.stroke();
  }

  drawCanvasMonths(minDate, maxDate, xMinDate, yMin, yMax) {
    const context = this.canvas.getContext('2d');

    context.font = Timeline.computeFont(
      context,
      TimelineDate.LARGER_MONTH_STRING,
      TimelineDate.LARGER_MONTH_DAY_COUNT * this.dayWidth,
      yMax - yMin
    );

    let cursor = xMinDate;
    let currentDate = minDate.clone();
    context.beginPath();
    context.moveTo(cursor + this.translation, yMax);

    const nextDate = currentDate.clone();

    while (nextDate.isBefore(maxDate) || nextDate.equals(maxDate)) {
      nextDate.copy(currentDate).toNextMonth();

      const nextMonthX =
        cursor + this.translation + currentDate.diff(nextDate) * this.dayWidth;

      const text = TimelineDate.monthToString(currentDate.month);
      const widthText = context.measureText(text).width;

      let xText = Math.max(0, cursor + this.translation);

      context.fillText(
        text,
        xText + widthText > nextMonthX ? nextMonthX - widthText : xText,
        yMax
      );

      cursor = nextMonthX - this.translation;
      context.lineTo(cursor + this.translation, yMax);
      context.lineTo(cursor + this.translation, yMin);
      context.lineTo(cursor + this.translation, yMax);
      currentDate.copy(nextDate);
    }

    context.lineTo(xMinDate, yMax);
    context.closePath();
    context.stroke();
  }

  /**
   *
   * @param {TimelineDate} minDate
   * @param {*} maxDate
   * @param {*} xMinDate
   * @param {*} yMin
   * @param {*} yMax
   * @param {*} precision
   */
  drawCanvasYears(minDate, maxDate, xMinDate, yMin, yMax, precision) {
    const context = this.canvas.getContext('2d');

    const precisionRounded = (number) =>
      parseInt(Math.floor(number / precision) * precision);

    let maxText = '';
    for (
      let year = precisionRounded(minDate.year);
      year <= precisionRounded(maxDate.year);
      year += precision
    ) {
      const text = numberToLabel(precisionRounded(year));
      if (text.length > maxText.length) maxText = text;
    }

    context.font = Timeline.computeFont(
      context,
      maxText,
      precision * TimelineDate.LARGER_YEAR_DAY_COUNT * this.dayWidth,
      yMax - yMin
    );

    let currentDate = minDate.clone();
    let cursor = xMinDate;
    context.beginPath();
    context.moveTo(cursor + this.translation, yMax);

    const nextDate = new TimelineDate(0);
    for (
      let year = precisionRounded(minDate.year);
      year <= precisionRounded(maxDate.year);
      year += precision
    ) {
      year + precision > MAX_YEAR
        ? nextDate.copy(maxDate)
        : nextDate.set(year + precision);

      const nextYearX =
        cursor + this.translation + currentDate.diff(nextDate) * this.dayWidth;

      const text = numberToLabel(precisionRounded(currentDate.year));
      const widthText = context.measureText(text).width;
      let xText = Math.max(0, cursor + this.translation);

      context.fillText(
        text,
        xText + widthText > nextYearX ? nextYearX - widthText : xText,
        yMax
      );

      cursor = nextYearX - this.translation;
      context.lineTo(cursor + this.translation, yMax);
      context.lineTo(cursor + this.translation, yMin);
      context.lineTo(cursor + this.translation, yMax);
      currentDate.copy(nextDate);

      if (year + precision == TimelineDate.MAX_TIMELINE_DATE.year) break;
    }

    context.closePath();
    context.stroke();
  }

  update() {
    this.drawCanvas();
  }
  // scale property
  get scale() {
    return this._scale;
  }

  set scale(value) {
    this._scale = Math.max(Math.min(value, this.maxScale), 1);
  }

  // translation property
  get translation() {
    return this._translation;
  }

  set translation(value) {
    this._translation = Math.round(
      Math.max(
        -(this.totalDayCount * this.dayWidth - window.innerWidth), // TODO remove window.innerWidth
        Math.min(value, 0)
      )
    );
  }

  get dayWidth() {
    return this.minDayWidth * this.scale;
  }

  static computeFont(context, text, maxWidth, maxFontSize) {
    const ratio = 100;
    context.font = ratio + "px 'Segoe UI'";
    const textWidth = context.measureText(text).width;
    const fontSize = Math.min(maxFontSize, (ratio * maxWidth) / textWidth);
    return Math.round(fontSize) + "px 'Segoe UI'";
  }
}

window.customElements.define('timeline-div', Timeline, { extends: 'div' });

// DEBUG unit test done here for now
console.time('unit test');
const someDate = new TimelineDate(-13.8 * 1000000000, 5, 23);

const days = [
  1, 15, 30, 31, 32, 5, 10, 56, 12515, 11151818, 18181812, 365, 366, 364, 367,
  12, 5485, 845, 184, 151, 85, 58,
];

days.sort((a, b) => a - b);

days.forEach((d) => {
  const td1 = someDate.clone().add(d);
  if (td1.diff(someDate) != d) {
    debugger;
    const td2 = someDate.clone().add(d);
    console.log(someDate.toString());
    console.log(td1.toString());
    console.log(td1.diff(someDate), '!=', d);
    throw new Error('td1 diff should be d');
  }
});
console.timeEnd('unit test');
