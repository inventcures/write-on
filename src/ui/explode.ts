/** A small burst of sparks where a variant was deleted. */
export function explode(rect: DOMRect, color: string): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 22; i++) {
    const spark = document.createElement('div');
    spark.className = 'spark';
    spark.style.background = color;
    spark.style.left = `${cx}px`;
    spark.style.top = `${cy}px`;
    document.body.append(spark);
    const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 24 + Math.random() * Math.max(30, rect.width / 2);
    spark
      .animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.3)`, opacity: 0 },
        ],
        { duration: 420 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.3,1)' },
      )
      .finished.finally(() => spark.remove());
  }
}
