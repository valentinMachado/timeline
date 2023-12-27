export class TimelineControls {
  constructor(timeline) {
    this.enable = true;

    timeline.canvas.addEventListener('wheel', (event) => {
      if (!this.enable) return;
      const worldX = (event.offsetX - timeline.translation) / timeline.scale;
      timeline.scale *= -Math.abs(event.deltaY) / event.deltaY > 0 ? 2 : 0.5;
      timeline.translation = -(worldX * timeline.scale - event.offsetX);
      timeline.update();
    });

    let isDragging = false;
    let startTranslation = 0;

    timeline.canvas.addEventListener('mousedown', (event) => {
      if (!this.enable) return;
      isDragging = true;
      startTranslation = event.clientX - timeline.translation;
    });

    timeline.canvas.addEventListener('mousemove', (event) => {
      if (!this.enable) return;

      if (isDragging) {
        timeline.translation = event.clientX - startTranslation;
        timeline.update();
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }
}
