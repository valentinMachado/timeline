import './style.css';

const saveFloatLocalStorage = (key, getter) => {
  return null;
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
const BIG_BANG_YEAR = 1900;

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

class Transform {
  constructor() {
    this.scale = 1;
    this.offset = 0;
  }

  get matrix3() {
    return [this.scale, 0, 0, this.scale, this.offset, 0, 0, 0, 0, 1];
  }
}

class Timeline {
  constructor() {
    // creation domElement
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

    const transform = new Transform();
    transform.offset =
      saveFloatLocalStorage('timeline_translation', () => {
        return transform.offset;
      }) || 0;
    transform.scale =
      saveFloatLocalStorage('timeline_scale', () => {
        return transform.scale;
      }) || 1;

    const draw = () => {
      const dayHeight = (1 / transform.scale) * 100;
      const monthHeight = (1 / transform.scale) * 200;
      const yearHeight = (1 / transform.scale) * 300;

      // console.log(transform.scale, dayHeight, monthHeight, yearHeight);

      const ctx = this.domElement.getContext('2d');

      ctx.clearRect(0, 0, this.domElement.width, this.domElement.height);

      ctx.save();

      ctx.transform(
        transform.scale,
        0,
        0,
        transform.scale,
        transform.offset,
        0
      );

      // timeline background
      {
        let widthTimeline = 0;
        for (let year = minDate.year; year <= maxDate.year; year++) {
          for (let month = 0; month < 12; month++) {
            const dayCount = TimelimeDate.dayCount(year, month);
            for (let day = 1; day <= dayCount; day++) {
              widthTimeline += 50;
            }
          }
        }
        ctx.fillStyle = 'gray';
        ctx.fillRect(0, 0, widthTimeline, yearHeight);
      }

      // timeline day/month/year
      {
        ctx.beginPath();
        // 10 unit => 1 day
        // minDate => x = 0
        ctx.lineTo(0, 0);

        let cursor = 0;
        ctx.fillStyle = 'white';

        for (let year = minDate.year; year <= maxDate.year; year++) {
          ctx.fillText(year, cursor, yearHeight);
          for (let month = 0; month < 12; month++) {
            ctx.fillText(
              TimelimeDate.monthToString(month),
              cursor,
              monthHeight
            );
            const dayCount = TimelimeDate.dayCount(year, month);
            for (let day = 1; day <= dayCount; day++) {
              ctx.fillText(day, cursor, dayHeight);
              const size =
                day == 1 ? (!month ? yearHeight : monthHeight) : dayHeight;

              ctx.lineTo(cursor, size);
              ctx.lineTo(cursor, 0);
              cursor += 50;
              ctx.lineTo(cursor, 0);
            }
          }
        }

        ctx.closePath();

        ctx.stroke();
      }

      ctx.restore();
    };
    draw();

    this.domElement.addEventListener('wheel', (event) => {
      transform.scale = Math.max(
        Math.min(transform.scale - event.deltaY * 0.002, 10),
        0.1
      ); // TODO speed = f(transform.scale)
      transform.offset -= -(transform.scale - 1) * event.clientX;
      console.log(transform);
      draw();
    });

    let isDragging = false;
    let startTranslation = 0;

    this.domElement.addEventListener('mousedown', (event) => {
      isDragging = true;
      startTranslation = event.clientX - transform.offset;
    });

    this.domElement.addEventListener('mousemove', (event) => {
      if (isDragging) {
        transform.offset = event.clientX - startTranslation;
        draw();
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('keydown', (event) => {
      const speedTranslation = 200;
      if (event.key == 'ArrowRight') {
        transform.offset -= speedTranslation;
        draw();
      } else if (event.key == 'ArrowLeft') {
        transform.offset += speedTranslation;
        draw();
      }
    });

    console.log(minDate, maxDate);
  }
}

const timeline = new Timeline();
document.body.appendChild(timeline.domElement);

// DEBUG
window.addEventListener('keydown', (event) => {
  if (event.key == 'p') console.log(timeline);
});
