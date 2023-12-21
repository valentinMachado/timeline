import { Timeline } from './Timeline/Timeline';
import './style.css';

const timeline = new Timeline();
document.body.appendChild(timeline);

// DEBUG
window.addEventListener('keydown', (event) => {
  const speedTranslation = 200;
  if (event.key == 'p') {
    console.log(timeline);
  } else if (event.key == 'ArrowRight') {
    timeline.translation -= speedTranslation;
    timeline.drawCanvas();
  } else if (event.key == 'ArrowLeft') {
    timeline.translation += speedTranslation;
    timeline.drawCanvas();
  }
});
