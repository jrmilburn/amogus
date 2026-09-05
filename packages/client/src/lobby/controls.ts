import {
  COLORS,
  type ColorId,
  SETTING_KEYS,
  SETTINGS_FIELDS,
  type SettingsValues,
} from '@mutiny/shared';

export function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing UI element: ${selector}`);
  return result;
}

export function colorPicker(
  container: HTMLElement,
  onSelect: (id: ColorId) => void,
) {
  const buttons = COLORS.map((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-option';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.setProperty('--swatch', color.hex);
    const number = document.createElement('span');
    number.className = 'swatch-number';
    number.textContent = String(color.number);
    swatch.append(number);
    const label = document.createElement('span');
    label.textContent = color.name;
    button.append(swatch, label);
    button.addEventListener('click', () => onSelect(color.id));
    container.append(button);
    return { button, color };
  });
  return (selected: ColorId, taken = new Set<ColorId>(), disabled = false) => {
    for (const { button, color } of buttons) {
      const unavailable = taken.has(color.id) && color.id !== selected;
      button.disabled = disabled || unavailable;
      button.setAttribute('aria-pressed', String(color.id === selected));
      button.setAttribute(
        'aria-label',
        `${color.name}, number ${color.number}${unavailable ? ', taken' : ''}`,
      );
      button.title = unavailable ? `${color.name} is taken` : color.name;
    }
  };
}

export function settingsControls(
  container: HTMLElement,
  onChange: (patch: Partial<SettingsValues>) => void,
) {
  const controls = SETTING_KEYS.map((key) => {
    const field = SETTINGS_FIELDS[key];
    const wrapper = document.createElement('div');
    wrapper.className = 'setting';
    const label = document.createElement('label');
    label.htmlFor = `setting-${key}`;
    label.textContent = field.label;
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.name = key;
    input.type = field.kind === 'boolean' ? 'checkbox' : 'number';
    if (field.kind === 'number') {
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step);
      input.required = true;
    }
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.id = `hint-${key}`;
    hint.textContent = field.hint;
    input.setAttribute('aria-describedby', hint.id);
    input.addEventListener('change', () => {
      if (!input.reportValidity()) return;
      onChange({
        [key]: field.kind === 'boolean' ? input.checked : input.valueAsNumber,
      });
    });
    wrapper.append(label, input, hint);
    container.append(wrapper);
    return { key, input, field };
  });
  return (settings: SettingsValues, force = false) => {
    for (const { key, input, field } of controls) {
      if (!force && document.activeElement === input) continue;
      if (field.kind === 'boolean') input.checked = settings[key] as boolean;
      else input.value = String(settings[key]);
    }
  };
}
