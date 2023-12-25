import {
  isNumeric,
  localStorageFloat,
  numberEquals,
  numberToLabel,
} from '../utils';

import { TimelineUI } from './UI';
import { TimelineDate, MIN_CHUNK_YEARS, MAX_YEAR } from './Date';

import './style.css';

export class Timeline extends HTMLElement {
  constructor() {
    super();

    // css
    this.classList.add('timeline');

    /** @type {TimelineUI} */
    this.ui = new TimelineUI();
    this.appendChild(this.ui);

    /** @type {HTMLCanvasElement} */
    this.canvas = document.createElement('canvas');
    this.appendChild(this.canvas);

    /** @type {Function} */
    this._resizeListener = () => {
      this.canvas.width = window.innerWidth * 0.8;
      this.canvas.height = window.innerHeight * 0.3;
      this._computeWidthAttributes();
      this.update();
    };

    this.canvas.width = window.innerWidth * 0.8;
    this.canvas.height = window.innerHeight * 0.3;
    this._computeWidthAttributes();

    const localStorageScale = localStorageFloat('timeline_scale', () => {
      return this.scale;
    });

    const localStorageTranslation = localStorageFloat(
      'timeline_translation',
      () => {
        return this.translation;
      }
    );

    isNumeric(localStorageScale)
      ? (this.scale = localStorageScale)
      : (this.scale = 1);

    isNumeric(localStorageTranslation)
      ? (this.translation = localStorageTranslation)
      : (this.translation = 0);

    this.update();

    this._addEventListeners();

    //DEBUG
    // this.scale = 1;
    // this.translation = 0;
  }

  _addEventListeners() {
    this.canvas.addEventListener('wheel', (event) => {
      const worldX = (event.offsetX - this.translation) / this.scale;
      this.scale *= -Math.abs(event.deltaY) / event.deltaY > 0 ? 2 : 0.5;
      this.translation = -(worldX * this.scale - event.offsetX);
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

    window.addEventListener('resize', this._resizeListener);

    // ui
    this.ui.minClampDateSelector.addEventListener('change', () => {
      this._computeWidthAttributes();
      this.update();
    });
    this.ui.maxClampDateSelector.addEventListener('change', () => {
      this._computeWidthAttributes();
      this.update();
    });
  }

  _computeWidthAttributes() {
    this.totalDayCount = this.ui.maxClampDateSelector.value.diff(
      this.ui.minClampDateSelector.value
    ); // number of day between min and max
    console.info('total days = ' + this.totalDayCount);
    if (this.totalDayCount > Number.MAX_SAFE_INTEGER)
      console.warn('total day count overflow');

    this.minDayWidth = this.canvas.width / this.totalDayCount; // minScale=1 shows between minDate and maxDate
    if (this.minDayWidth < Number.EPSILON)
      console.warn('min day width overflow');

    this.maxScale = this.canvas.width / this.minDayWidth; // day width cant be superior this.canvas.width

    // force a set with setter because its depends of this.canvas.width and this.maxScale
    this.scale = this.scale; // scale first because scale does not depends of translation whereas translation does
    this.translation = this.translation;
  }

  _drawCanvas() {
    console.time('draw canvas');

    const context = this.canvas.getContext('2d');
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // compute min and max date on screen
    const minDateOnScreen = this.ui.minClampDateSelector.value
      .clone()
      .add(Math.floor(-this.translation / this.dayWidth));
    const maxDateOnScreen = minDateOnScreen
      .clone()
      .add(Math.ceil(this.canvas.width / this.dayWidth));

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
        this._drawCanvasYears(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          0,
          this.canvas.height * 0.5,
          1
        );
        this._drawCanvasMonths(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          this.canvas.height * 0.5,
          this.canvas.height
        );
      } else {
        // a year is superior to canvas width => draw year, month and days
        this._drawCanvasYears(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          0,
          this.canvas.height * 0.3,
          1
        );
        this._drawCanvasMonths(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          this.canvas.height * 0.3,
          this.canvas.height * 0.6
        );
        this._drawCanvasDays(
          minDateOnScreen,
          maxDateOnScreen,
          xMinDate,
          this.canvas.height * 0.6,
          this.canvas.height
        );
      }
    } else {
      this._drawCanvasYears(
        minDateOnScreen,
        maxDateOnScreen,
        xMinDate,
        0,
        this.canvas.height * 0.5,
        maxPrecision
      );

      this._drawCanvasYears(
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

  _drawCanvasDays(minDate, maxDate, xMinDate, yMin, yMax) {
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

  _drawCanvasMonths(minDate, maxDate, xMinDate, yMin, yMax) {
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
  _drawCanvasYears(minDate, maxDate, xMinDate, yMin, yMax, precision) {
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
    this._drawCanvas();
  }

  get scale() {
    return this._scale;
  }

  set scale(value) {
    this._scale = Math.max(Math.min(value, this.maxScale), 1);
  }

  get translation() {
    return this._translation;
  }

  set translation(value) {
    this._translation = Math.round(
      Math.max(
        -(this.totalDayCount * this.dayWidth - this.canvas.width),
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

window.customElements.define('timeline-div', Timeline);

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
