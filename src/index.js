import { Timeline } from './Timeline/index';
import './style.css';

console.time('timeline created');
const timeline = new Timeline();
console.timeEnd('timeline created');
document.body.appendChild(timeline);

// DEBUG
window.addEventListener('keydown', (event) => {
  const speedTranslation = 200;
  if (event.key == 'p') {
    console.log(timeline);
  } else if (event.key == 'ArrowRight') {
    timeline.translation -= speedTranslation;
    timeline.update();
  } else if (event.key == 'ArrowLeft') {
    timeline.translation += speedTranslation;
    timeline.update();
  } else if (event.key == 'ArrowUp') {
    timeline.scale -= speedTranslation;
    timeline.update();
  } else if (event.key == 'ArrowDown') {
    timeline.scale += speedTranslation;
    timeline.update();
  }
});
