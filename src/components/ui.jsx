import { forwardRef, useId, useRef, useState } from 'react';
import { Slider, ToggleGroup, Tooltip } from 'radix-ui';
import { useGlide } from './hooks.js';

export function Tip({ label, children, side = 'bottom', kbd }) {
  if (!label) return children;
  return (
    <Tooltip.Root delayDuration={350}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tip" side={side} sideOffset={8} collisionPadding={10}>
          {label}
          {kbd && <kbd>{kbd}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const Button = forwardRef(function Button({ variant = 'quiet', size = 'md', icon: Icon, children, className = '', ...rest }, ref) {
  return (
    <button ref={ref} type="button" className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 15 : 16} strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </button>
  );
});

export const IconButton = forwardRef(function IconButton({ icon: Icon, label, kbd, pressed, className = '', size = 18, tipSide, ...rest }, ref) {
  return (
    <Tip label={label} kbd={kbd} side={tipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        className={`icon-btn ${pressed ? 'is-on' : ''} ${className}`}
        {...rest}
      >
        <Icon size={size} strokeWidth={1.6} aria-hidden="true" />
      </button>
    </Tip>
  );
});

export function Segmented({ value, options, onChange, label, size = 'md', className = '' }) {
  const root = useRef(null);
  const thumb = useRef(null);
  useGlide(root, thumb, '.seg-btn[data-state="on"]', value);
  return (
    <ToggleGroup.Root
      ref={root}
      type="single"
      className={`seg seg--${size} ${className}`}
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onChange(v)}
    >
      <span className="seg-thumb" ref={thumb} aria-hidden="true" />
      {options.map((op) => (
        <ToggleGroup.Item key={op.value} value={op.value} className="seg-btn" disabled={op.disabled} aria-label={op.aria || undefined}>
          {op.icon}
          {op.label && <span>{op.label}</span>}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function NumberField({ label, value, unit, min, max, onChange, assumed }) {
  const id = useId();
  const [txt, setTxt] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setTxt(String(+(+value).toFixed(2)));
  }
  const commit = () => {
    const v = parseFloat(txt);
    if (!Number.isFinite(v)) return setTxt(String(value));
    const c = Math.min(max, Math.max(min, v));
    setTxt(String(c));
    if (c !== value) onChange(c);
  };
  return (
    <div className={`nf ${assumed ? 'is-assumed' : ''}`}>
      <label className="nf-label" htmlFor={id}>
        {label}
        {assumed && <em className="assumed">assumed</em>}
      </label>
      <span className="nf-box">
        <input
          id={id}
          inputMode="decimal"
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {unit && <span className="nf-unit">{unit}</span>}
      </span>
    </div>
  );
}

export function SliderField({ label, value, unit, min, max, step, onChange, format = (v) => v }) {
  const id = useId();
  return (
    <div className="sf">
      <div className="sf-top">
        <span id={id}>{label}</span>
        <output aria-labelledby={id}>
          {format(value)}
          {unit && <span className="unit"> {unit}</span>}
        </output>
      </div>
      <Slider.Root className="slider" min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} aria-labelledby={id}>
        <Slider.Track className="slider-track">
          <Slider.Range className="slider-range" />
        </Slider.Track>
        <Slider.Thumb className="slider-thumb" aria-labelledby={id} />
      </Slider.Root>
    </div>
  );
}

export function Stepper({ value, min, max, onChange, label }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => onChange(value - 1)} disabled={value <= min}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(value + 1)} disabled={value >= max}>+</button>
    </div>
  );
}

// Section hatches from drafting convention: wood grain, concrete aggregate, steel diagonal.
export function MaterialSwatch({ material, size = 14, className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`swatch swatch--${material} ${className}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <defs>
        <clipPath id={`c${id}`}>
          <rect width="16" height="16" rx="3.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width="16" height="16" className="swatch-fill" />
        {material === 'timber' && (
          <g className="swatch-ink" fill="none" strokeWidth="0.9">
            <path d="M-1 4.5c3.5-2 6.5 1.6 10.5-.4S16 3 17 3.6" />
            <path d="M-1 9c3-1.6 6.8 1.8 10.4-.2S15.6 7.4 17 8" />
            <path d="M-1 13.4c3.4-1.8 6.4 1.4 10.2-.4S15.4 12 17 12.6" />
          </g>
        )}
        {material === 'concrete' && (
          <g className="swatch-ink-fill">
            <circle cx="3.2" cy="3.4" r="0.8" /><circle cx="10.6" cy="5.2" r="0.7" /><circle cx="6.4" cy="11.8" r="0.8" />
            <circle cx="13.2" cy="12.4" r="0.6" /><circle cx="2.4" cy="9.4" r="0.55" /><circle cx="9.2" cy="9" r="0.5" />
            <path d="M12 1.6l2 3.2h-4zM4.2 13.6l1.6 2.4h-3.2zM6.6 4.6l1.5 2.4H5.1z" />
          </g>
        )}
        {material === 'steel' && (
          <g className="swatch-ink" strokeWidth="1">
            <path d="M-4 8L8-4M-4 14L14-4M-2 18L18-2M4 18L20 2M10 18L20 8" />
          </g>
        )}
      </g>
    </svg>
  );
}

// The mark: a two-bay plan with its six columns.
export function BrandMark({ size = 22 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 10h20M6 22h20M6 10v12M16 10v12M26 10v12" fill="none" stroke="currentColor" strokeWidth="1.7" />
      {[6, 16, 26].flatMap((x) => [10, 22].map((y) => <rect key={`${x}${y}`} x={x - 1.9} y={y - 1.9} width="3.8" height="3.8" fill="currentColor" />))}
    </svg>
  );
}

// A small plan of a column grid, drawn to scale inside a w x h box.
export function PlanGlyph({ L, W, nx, nz, w = 64, h = 40, pad = 4, className = '' }) {
  const s = Math.min((w - 2 * pad) / L, (h - 2 * pad) / W);
  const pw = L * s, ph = W * s;
  const x0 = (w - pw) / 2, y0 = (h - ph) / 2;
  const xs = Array.from({ length: nx + 1 }, (_, i) => x0 + (i * pw) / nx);
  const ys = Array.from({ length: nz + 1 }, (_, j) => y0 + (j * ph) / nz);
  const c = Math.max(1.6, Math.min(3, s * 0.35));
  return (
    <svg className={`plan-glyph ${className}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <rect x={x0} y={y0} width={pw} height={ph} className="pg-fill" />
      {xs.map((x, i) => <line key={`x${i}`} x1={x} y1={y0} x2={x} y2={y0 + ph} className="pg-line" />)}
      {ys.map((y, j) => <line key={`y${j}`} x1={x0} y1={y} x2={x0 + pw} y2={y} className="pg-line" />)}
      {xs.flatMap((x, i) => ys.map((y, j) => <rect key={`${i}-${j}`} x={x - c / 2} y={y - c / 2} width={c} height={c} className="pg-col" />))}
    </svg>
  );
}
