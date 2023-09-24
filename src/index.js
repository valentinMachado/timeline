import './style.css';

const saveFloatLocalStorage = (key, getter) => {
  window.addEventListener('beforeunload', () => {
    localStorage.setItem(key, JSON.stringify(getter()));
  });

  return localStorage.getItem(key)
    ? parseFloat(localStorage.getItem(key))
    : null;
};

/** @type {Date} */
const now = new Date(Date.now());

// const BIG_BANG_YEAR = -13.8 * 1000000000;
const BIG_BANG_YEAR = 1992;

class TimelimeDate {
  constructor(year, month = 0, day = 1) {
    this.year = parseInt(year);
    this.month = parseInt(month);
    this.day = parseInt(day);

    if (!TimelimeDate.assert(this)) console.error(this, 'is not a vallid date');
  }

  get dayCount() {}

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
   * @param {TimelimeDate} date
   * @returns {boolean}
   */
  static assert(date) {
    return (
      TimelimeDate.assertDay(date.day) &&
      TimelimeDate.assertMonth(date.month) &&
      TimelimeDate.assertYear(date.year)
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

  static dayCount(year, month) {
    if (month % 2) {
      // february/1 , april/3
      if (month == 1) {
        return TimelimeDate.yearIsLeap(year) ? 29 : 28;
      } else {
        return 30;
      }
    } else {
      // january/0, marth/2
      return 31;
    }
  }
}

class Timeline {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.domElement.classList.add('timeline');

    // full screen
    this.domElement.width = window.innerWidth;
    this.domElement.height = window.innerHeight;

    // boundaries
    const minDate = new TimelimeDate(BIG_BANG_YEAR);
    const maxDate = new TimelimeDate(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    // ctx transform

    // translation
    let startTranslation = 0;
    let translation =
      saveFloatLocalStorage('timeline_translation', () => {
        return translation;
      }) || 0;
    let isDragging = false;

    this.domElement.addEventListener('mousedown', (event) => {
      isDragging = true;
      startTranslation = event.clientX - translation;
    });

    this.domElement.addEventListener('mousemove', (event) => {
      if (isDragging) {
        translation = event.clientX - startTranslation;
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // scale
    let scale =
      saveFloatLocalStorage('timeline_scale', () => {
        return scale;
      }) || 1;

    this.domElement.addEventListener('wheel', (event) => {
      scale -= event.deltaY * 0.002;
      console.log(scale);
    });

    console.log(minDate, maxDate);

    // update
    const tick = () => {
      // TODO framerate
      requestAnimationFrame(tick);

      const ctx = this.domElement.getContext('2d');

      ctx.clearRect(0, 0, this.domElement.width, this.domElement.height);

      ctx.save();

      ctx.translate(translation, 0);
      ctx.scale(scale, scale);

      ctx.beginPath();
      // 10 unit => 1 day
      // minDate => x = 0
      ctx.lineTo(0, 0);

      let cursor = 0;
      for (let year = minDate.year; year <= maxDate.year; year++) {
        ctx.fillText(year, cursor, 200);
        for (let month = 0; month < 12; month++) {
          ctx.fillText(TimelimeDate.monthToString(month), cursor, 150);
          const dayCount = TimelimeDate.dayCount(year, month);
          for (let day = 1; day <= dayCount; day++) {
            ctx.fillText(day, cursor, 120);
            const size = day == 1 ? (!month ? 300 : 200) : 100;

            ctx.lineTo(cursor, size);
            ctx.lineTo(cursor, 0);
            cursor += 50;
            ctx.lineTo(cursor, 0);
          }
        }
      }

      ctx.closePath();

      ctx.stroke();

      // ctx.fillRect(0, 0, 100, 100);

      ctx.restore();
    };
    tick();
  }
}

const timeline = new Timeline();
document.body.appendChild(timeline.domElement);

// DEBUG
window.addEventListener('keydown', (event) => {
  if (event.key == 'p') console.log(timeline);
});
