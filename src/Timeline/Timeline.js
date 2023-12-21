import { localStorageFloat } from '../utils';
import './timeline.css';

/** @type {Date} */
const now = new Date(Date.now());

// const BIG_BANG_YEAR = -13.8 * 1000000000;
const BIG_BANG_YEAR = 2023;

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
      // fill day in year diff
      for (let year = minDate.year; year < maxDate.year; year++) {
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

    console.log('diff', minDate, maxDate, result);
    return result;
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

  static yearIsLeap(year) {
    // 1992 is leap
    return !Math.abs(1992 - year) % 4;
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
    let result = 0;
    for (let i = 0; i < 12; i++) {
      result += TimelineDate.monthDayCount(year, i);
    }
    return result;
  }

  static monthDayCount(year, month) {
    if (month % 2) {
      // february/1 , april/3
      if (month == 1) {
        return TimelineDate.yearIsLeap(year) ? 29 : 28;
      } else {
        return 30;
      }
    } else {
      // january/0, marth/2
      return 31;
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

    this.totalDays = this.maxDate.diffDayCount(this.minDate); // number of day between min and max

    this.translation =
      localStorageFloat('timeline_translation', () => {
        return this.translation;
      }) || 0;
    this.scale =
      localStorageFloat('timeline_scale', () => {
        return this.scale;
      }) || 1;

    //DEBUG
    this.scale = 1;
    this.translation = 0;

    this.canvas.addEventListener('wheel', (event) => {
      const worldX = (event.clientX - this.translation) / this.scale;
      this.scale = this.scale - event.deltaY * 0.002; // TODO speed = f(this.scale) log ?
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
    console.log('draw canvas', this.scale, this.translation);

    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const dayHeight = this.canvas.height / 3;
    const monthHeight = (this.canvas.height * 2) / 3;
    const yearHeight = this.canvas.height;

    // timeline day/month/year
    {
      let cursor = 0;
      ctx.beginPath();
      ctx.moveTo(cursor + this.translation, 0);

      ctx.fillStyle = 'white';

      for (let year = this.minDate.year; year <= this.maxDate.year; year++) {
        ctx.fillText(year, cursor + this.translation, yearHeight);
        for (let month = 0; month < 12; month++) {
          ctx.fillText(
            TimelineDate.monthToString(month),
            cursor + this.translation,
            monthHeight
          );
          const monthDayCount = TimelineDate.monthDayCount(year, month);
          for (let day = 1; day <= monthDayCount; day++) {
            ctx.fillText(day, cursor + this.translation, dayHeight);
            const size =
              day == 1 ? (!month ? yearHeight : monthHeight) : dayHeight;

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

  // scale property
  get scale() {
    return this._scale;
  }

  set scale(value) {
    this._scale = Math.max(Math.min(value, 10), 1);
  }

  // translation property
  get translation() {
    return this._translation;
  }

  set translation(value) {
    this._translation = Math.max(
      -(this.totalDays * this.dayWidth - window.innerWidth), // TODO remove window.innerWidth
      Math.min(value, 0)
    );
  }

  get dayWidth() {
    return 30 * this.scale;
  }
}

window.customElements.define('timeline-div', Timeline, { extends: 'div' });
