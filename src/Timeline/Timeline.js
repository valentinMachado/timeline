import { localStorageFloat } from '../utils';
import './timeline.css';

/** @type {Date} */
const now = new Date(Date.now());

const BIG_BANG_YEAR = -13.8 * 1000000000;
// const BIG_BANG_YEAR = 2000;

export class TimelineDate {
  constructor(year, month = 0, day = 1) {
    this.year = parseInt(year);
    this.month = parseInt(month);
    this.day = parseInt(day);

    if (!TimelineDate.assert(this)) console.error(this, 'is not a vallid date');
  }

  isAfter(timelineDate) {
    if (this.year != timelineDate.year) {
      return this.year > timelineDate.year;
    } else {
      // year are equals
      if (this.month != timelineDate.month) {
        return this.month > timelineDate.month;
      } else {
        // month are equals
        if (this.day != timelineDate.day) {
          return this.day > timelineDate.day;
        } else {
          // date are equals
          return false;
        }
      }
    }
  }

  isBefore(timelineDate) {
    return !this.isAfter(timelineDate);
  }

  diffDayCount(timelineDate) {
    let minDate, maxDate;
    if (this.isAfter(timelineDate)) {
      minDate = timelineDate;
      maxDate = this;
    } else {
      minDate = this;
      maxDate = timelineDate;
    }

    let result = 0;

    if (minDate.year != maxDate.year) {
      const diffYear = maxDate.year - minDate.year;
      const fourHundredYearCount = Math.floor(diffYear / 400);
      result += fourHundredYearCount * TimelineDate.FOUR_HUNDRED_DAY_COUNT;
      // fill day in year diff
      for (
        let year = minDate.year + fourHundredYearCount * 400;
        year < maxDate.year;
        year++
      ) {
        result += TimelineDate.yearDayCount(year);
      }

      // fill missing day of maxDate
      for (let month = 0; month < maxDate.month; month++) {
        result += TimelineDate.monthDayCount(maxDate.year, month);
      }

      result += maxDate.day;
    } else {
      // year are equals
      if (minDate.month != maxDate.month) {
        // fill missing day of month
        for (let month = minDate.month; month < maxDate.month; month++) {
          result += TimelineDate.monthDayCount(maxDate.year, month);
        }

        result += maxDate.day;
      } else {
        // month are equals
        result = maxDate.day - minDate.day;
      }
    }

    return result;
  }

  clone() {
    return new TimelineDate(this.year, this.month, this.day);
  }

  add(dayCount) {
    if (!dayCount) return this; // no days to add
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
    if (!fillMonth()) return this; // no more days

    // there are still days to add

    // fill this.year
    for (let month = this.month; month < 12; month++) {
      // fill month
      if (!fillMonth()) return this;
    }

    // year filled and still days to add
    if (this.month != 0 || this.day != 1 || dayCount <= 0)
      throw new Error('year not filled properly');

    // add as many year as possible
    let currentYearDayCount = TimelineDate.yearDayCount(this.year);
    while (dayCount >= currentYearDayCount) {
      dayCount -= currentYearDayCount;
      this.year++;
      currentYearDayCount = TimelineDate.yearDayCount(this.year);
    }

    if (dayCount == 0) return this; // no more days

    // year filled and still days to add but less than the current year day count
    if (this.month != 0 || this.day != 1 || dayCount >= currentYearDayCount)
      throw new Error('year not filled properly');

    // fill this.year
    for (let month = 0; month < 12; month++) {
      // fill month
      if (!fillMonth()) return this;
    }

    throw new Error('fill month above should return at a moment');
  }

  toString() {
    return (
      this.day + ', ' + TimelineDate.monthToString(this.month) + ' ' + this.year
    );
  }

  static assertYear(year) {
    return year <= parseInt(now.getFullYear()) && year >= BIG_BANG_YEAR;
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
    return (
      TimelineDate.assertDay(date.day) &&
      TimelineDate.assertMonth(date.month) &&
      TimelineDate.assertYear(date.year)
    );
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

  static get FOUR_HUNDRED_DAY_COUNT() {
    return 146097; // day count in 400 year is constant
  }

  static monthDayCount(year, month) {
    if (month % 2) {
      if (month == 1) {
        // february
        return TimelineDate.yearIsLeap(year) ? 29 : 28;
      } else if (month < 7) {
        // april/3, june/5
        return 30;
      } else {
        // august / 7, october / 9, december / 11;
        return 31;
      }
    } else {
      if (month < 6) {
        // january/0, marth/2, may/4, july/6
        return 31;
      } else {
        // september/8, november/10
        return 30;
      }
    }
  }
}

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
    this.canvas.height = window.innerHeight;

    /** @type {TimelineDate} */
    this.minDate = new TimelineDate(BIG_BANG_YEAR);

    /** @type {TimelineDate} */
    this.maxDate = new TimelineDate(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    this.totalDayCount = this.maxDate.diffDayCount(this.minDate); // number of day between min and max

    this.minDayWidth = window.innerWidth / this.totalDayCount; // minScale shows between minDate and maxDate

    this.maxScale = window.innerWidth / this.minDayWidth; // day width cant be superior window.innerWidth

    this._translation = localStorageFloat('timeline_translation', () => {
      return this.translation;
    });
    this._scale = localStorageFloat('timeline_scale', () => {
      return this.scale;
    });
    if (this.scale == null) this.scale = 1;
    if (this.translation == null) this.translation = 0;

    //DEBUG
    this.scale = 1;
    this.translation = 0;

    this.canvas.addEventListener('wheel', (event) => {
      const worldX = (event.clientX - this.translation) / this.scale;

      const maxSpeed = this.totalDayCount / 200000;
      const minSpeed = Math.min(0.1, maxSpeed);

      // f(1) = maxSpeed
      // f(maxScale) = minSpeed
      const speed =
        maxSpeed -
        (maxSpeed - minSpeed) / (1 - Math.log10(this.maxScale)) +
        (Math.log10(this.scale) * (maxSpeed - minSpeed)) /
          (1 - Math.log10(this.maxScale)); // TODO: not working very well waiting to handle BIG_BANG_YEAR

      this.scale = this.scale - event.deltaY * speed;
      this.translation = -(worldX * this.scale - event.clientX);
      this.drawCanvas();
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
        this.drawCanvas();
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    this.drawCanvas();
  }

  drawCanvas() {
    return;
    console.time('draw canvas');

    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // compute min and max date on screen
    console.time('compute min and max date on screen');
    const minDateOnScreen = this.minDate
      .clone()
      .add(Math.floor(-this.translation / this.dayWidth));
    const maxDateOnScreen = minDateOnScreen
      .clone()
      .add(Math.ceil(window.innerWidth / this.dayWidth));
    console.timeEnd('compute min and max date on screen');

    {
      // day rendering TODO make this generic
      if (this.dayWidth >= 20) {
        // timeline day/month/year
        const dayHeight = this.canvas.height / 3;
        const monthHeight = (this.canvas.height * 2) / 3;
        const yearHeight = this.canvas.height;
        let cursor = 0;
        ctx.beginPath();
        ctx.moveTo(cursor + this.translation, 0);

        ctx.fillStyle = 'white';

        const computeFont = (text, maxWidth, maxFontSize) => {
          const ratio = 100;
          ctx.font = ratio + "px 'Segoe UI'";
          const textWidth = ctx.measureText(text).width;
          const fontSize = Math.min(
            maxFontSize,
            (ratio * maxWidth) / textWidth
          );
          return Math.round(fontSize) + "px 'Segoe UI'";
        };

        for (let year = this.minDate.year; year <= this.maxDate.year; year++) {
          if (year < minDateOnScreen.year) {
            cursor += this.dayWidth * TimelineDate.yearDayCount(year);
            continue;
          }
          if (year > maxDateOnScreen.year) {
            break;
          }

          ctx.font = computeFont(
            year,
            this.dayWidth * TimelineDate.yearDayCount(year),
            this.canvas.height * 0.3
          );
          ctx.fillText(
            year,
            Math.min(
              Math.max(0, cursor + this.translation),
              cursor +
                this.translation +
                this.dayWidth * TimelineDate.yearDayCount(year) -
                ctx.measureText(year).width
            ),
            yearHeight
          );

          // ctx.fillText(year, cursor + this.translation, yearHeight);
          for (let month = 0; month < 12; month++) {
            if (year == minDateOnScreen.year && month < minDateOnScreen.month) {
              cursor += TimelineDate.monthDayCount(year, month) * this.dayWidth;
              continue;
            }

            if (year == maxDateOnScreen.year && month > maxDateOnScreen.month)
              break;

            ctx.font = computeFont(
              TimelineDate.monthToString(month),
              this.dayWidth * TimelineDate.monthDayCount(year, month),
              this.canvas.height * 0.3
            );

            ctx.fillText(
              TimelineDate.monthToString(month),
              Math.min(
                Math.max(0, cursor + this.translation),
                cursor +
                  this.translation +
                  this.dayWidth * TimelineDate.monthDayCount(year, month) -
                  ctx.measureText(TimelineDate.monthToString(month)).width
              ),
              monthHeight
            );

            const monthDayCount = TimelineDate.monthDayCount(year, month);
            for (let day = 1; day <= monthDayCount; day++) {
              if (
                year == minDateOnScreen.year &&
                month == minDateOnScreen.month &&
                day < minDateOnScreen.day
              ) {
                cursor += this.dayWidth;
                continue;
              }

              if (
                year == maxDateOnScreen.year &&
                month == maxDateOnScreen.month &&
                day > maxDateOnScreen.day
              )
                break;

              ctx.font = this.dayWidth * 0.5 + "px 'Segoe UI'";

              const size =
                day == 1 ? (!month ? yearHeight : monthHeight) : dayHeight;

              ctx.fillText(day, cursor + this.translation, dayHeight);
              ctx.lineTo(cursor + this.translation, size);
              ctx.lineTo(cursor + this.translation, 0);
              cursor += this.dayWidth;
              ctx.lineTo(cursor + this.translation, 0);
            }
          }
        }

        ctx.closePath();

        ctx.stroke();
      }
    }

    console.timeEnd('draw canvas');
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
}

window.customElements.define('timeline-div', Timeline, { extends: 'div' });
