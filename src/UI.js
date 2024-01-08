import {
  localStorageBoolean,
  localStorageInt,
  isNumeric,
  localStorageString,
  writeTokenInCookie,
} from './utils';
import { v4 as uuidv4 } from 'uuid';
import { TimelineDate } from './Date';

class LocalStorageDetails extends HTMLElement {
  constructor(id, summaryText) {
    super();

    this.details = document.createElement('details');
    this.details.classList.add('padded');
    this.appendChild(this.details);

    const summary = document.createElement('summary');
    summary.innerText = summaryText;
    this.details.appendChild(summary);

    this.details.open = localStorageBoolean(
      id + '_details_open',
      () => this.details.open
    );
  }
}

window.customElements.define('local-storage-details', LocalStorageDetails);

class LocalStorageInput extends HTMLElement {
  constructor(id, labelText, type, valueType, defaultValue) {
    super();

    this.classList.add('display_column');
    this.classList.add('padded');

    const label = document.createElement('label');
    label.innerText = labelText;
    this.appendChild(label);

    const uuid = uuidv4();
    label.htmlFor = uuid;

    /** @type {HTMLInputElement} */
    this.input = document.createElement('input');
    this.input.setAttribute('id', uuid);
    this.input.setAttribute('type', type);
    this.appendChild(this.input);

    if (valueType == LocalStorageInput.VALUE_TYPE.INTEGER) {
      const localStorageIntegerValue = localStorageInt(id, () =>
        parseInt(this.input.value)
      );
      this.input.value = isNumeric(localStorageIntegerValue)
        ? localStorageIntegerValue
        : defaultValue;
    } else if (valueType == LocalStorageInput.VALUE_TYPE.STRING) {
      const localStorageStringValue = localStorageString(
        id,
        () => this.input.value
      );
      this.input.value = localStorageStringValue
        ? localStorageStringValue
        : defaultValue;
    }
  }
}

// enum of value type for local storage input
LocalStorageInput.VALUE_TYPE = {
  INTEGER: 0,
  STRING: 1,
};

window.customElements.define('local-storage-input', LocalStorageInput);

class LocalStorageSelect extends HTMLElement {
  constructor(id, labelText, options, defaultValue) {
    super();

    this.classList.add('display_column');
    this.classList.add('padded');

    const label = document.createElement('label');
    label.innerText = labelText;
    this.appendChild(label);

    const uuid = uuidv4();
    label.htmlFor = uuid;

    /** @type {HTMLSelectElement} */
    this.select = document.createElement('select');
    this.select.setAttribute('id', uuid);
    this.appendChild(this.select);

    options.forEach((option) => {
      const optionDomElement = document.createElement('option');
      optionDomElement.value = option;
      optionDomElement.innerText = option;
      this.select.appendChild(optionDomElement);
    });

    const optionSelected = localStorageString(
      id + '_option_selected',
      () => this.select.value
    );
    optionSelected && optionSelected !== ''
      ? (this.select.value = optionSelected)
      : (this.select.value = defaultValue);
  }
}

window.customElements.define('local-storage-select', LocalStorageSelect);

class TimelineDateSelector extends LocalStorageDetails {
  constructor(id, summaryText, defaultValue) {
    super(id, summaryText);

    this._value = new TimelineDate();

    /** @type {LocalStorageInput} */
    this.year = new LocalStorageInput(
      id + '_year',
      'Année: ',
      'number',
      LocalStorageInput.VALUE_TYPE.INTEGER,
      defaultValue.year
    );
    this.details.appendChild(this.year);

    /** @type {LocalStorageInput} */
    this.month = new LocalStorageSelect(
      id + '_month',
      'Mois: ',
      TimelineDate.MONTHS,
      TimelineDate.monthToString(defaultValue.month)
    );
    this.details.appendChild(this.month);

    /** @type {LocalStorageInput} */
    this.day = new LocalStorageInput(
      id + '_day',
      'Jour: ',
      'number',
      LocalStorageInput.VALUE_TYPE.INTEGER,
      defaultValue.day
    );
    this.details.appendChild(this.day);
  }

  magnetize() {
    this.year.input.value = TimelineDate.magnetizeYear(this.year.input.value);
    this.month.select.value = TimelineDate.monthToString(
      TimelineDate.magnetizeMonth(
        TimelineDate.stringToMonth(this.month.select.value)
      )
    );
    this.day.input.value = TimelineDate.magnetizeDay(
      this.day.input.value,
      TimelineDate.stringToMonth(this.month.select.value),
      this.year.input.value
    );
  }

  get value() {
    this._value.set(
      this.year.input.valueAsNumber,
      TimelineDate.stringToMonth(this.month.select.value),
      this.day.input.valueAsNumber
    );
    return this._value;
  }

  set value(content) {
    this._value.copy(content);
    this.day.input.value = this._value.day;
    this.month.select.value = TimelineDate.monthToString(this._value.month);
    this.year.input.value = this._value.year;
  }
}

window.customElements.define('timeline-date-selector', TimelineDateSelector);

export class TimelineDateIntervalSelector extends HTMLElement {
  constructor(id, labelMinText, labelMaxText) {
    super();

    /** @type {TimelineDateSelector} */
    this.min = new TimelineDateSelector(
      id + '_min',
      labelMinText,
      TimelineDate.MIN_TIMELINE_DATE
    );
    this.appendChild(this.min);

    /** @type {TimelineDateSelector} */
    this.max = new TimelineDateSelector(
      id + '_max',
      labelMaxText,
      TimelineDate.MAX_TIMELINE_DATE
    );
    this.appendChild(this.max);

    // listeners
    this.min.addEventListener('change', () => {
      this.min.magnetize();

      // clamp
      this.min.value = this.min.value.clamp(
        TimelineDate.MIN_TIMELINE_DATE,
        this.max.value.subDay()
      );
    });

    this.max.addEventListener('change', () => {
      this.max.magnetize();

      // clamp
      this.max.value = this.max.value.clamp(
        this.min.value.add(1),
        TimelineDate.MAX_TIMELINE_DATE
      );
    });
  }
}

window.customElements.define(
  'timeline-date-interval-selector',
  TimelineDateIntervalSelector
);

export class TimelineEventEditor extends HTMLElement {
  constructor(id) {
    super();

    /** @type {LocalStorageInput} */
    this.titleInput = new LocalStorageInput(
      id + '_title',
      'Titre',
      'text',
      LocalStorageInput.VALUE_TYPE.STRING,
      ''
    );
    this.appendChild(this.titleInput);

    /** @type {TimelineDateIntervalSelector} */
    this.intervalSelector = new TimelineDateIntervalSelector(
      id + '_intervalSelector',
      'Début',
      'Fin'
    );
    this.appendChild(this.intervalSelector);

    /** @type {HTMLElement} */
    this.createEventButton = document.createElement('button');
    this.createEventButton.innerText = 'Créer';
    this.appendChild(this.createEventButton);

    /** @type {HTMLElement} */
    this.cancelButton = document.createElement('button');
    this.cancelButton.innerText = 'Annuler';
    this.appendChild(this.cancelButton);
  }
}

window.customElements.define('timeline-event-editor', TimelineEventEditor);

export class TimelineLeftPan extends HTMLElement {
  constructor() {
    super();

    this.classList.add('timeline-left-pan');

    /** @type {HTMLElement} */
    const disconnectButton = document.createElement('button');
    disconnectButton.innerText = 'Deconnexion';
    disconnectButton.classList.add('marged');
    disconnectButton.onclick = () => {
      writeTokenInCookie(null);
      window.location.href = './';
    };
    this.appendChild(disconnectButton);

    /** @type {TimelineDateIntervalSelector} */
    this.timelineIntervalSelector = new TimelineDateIntervalSelector(
      'timelineIntervalSelector',
      'Minimum date',
      'Maximum date'
    );
    this.appendChild(this.timelineIntervalSelector);

    /** @type {HTMLElement} */
    this.addTimelineEventButton = document.createElement('button');
    this.addTimelineEventButton.innerText = 'Ajouter un évènement';
    this.addTimelineEventButton.classList.add('marged');
    this.appendChild(this.addTimelineEventButton);
  }
}

window.customElements.define('timeline-left-pan', TimelineLeftPan);
