const { TimelineDate } = require('../public/dist/development/bundle'); //WIP should be done with puppeteer

const bigBangDate = new TimelineDate(-13.8 * 1000000000);

const aLotOfDays = 15138461843;

const td1 = bigBangDate.clone().add(aLotOfDays);

if (td1.diffDayCount(bigBangDate) != aLotOfDays)
  throw new Error('td1 diff should be aLotOfDay');

