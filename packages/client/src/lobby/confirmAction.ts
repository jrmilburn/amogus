import './confirm.css';

/** Confirmation belongs to the surface that owns the action, including nested meetings. */
export function confirmAction(
  host: HTMLElement,
  title: string,
  description: string,
  action: string,
  onConfirm: () => void,
) {
  if (host.querySelector('.confirm-action')) return;
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-action';
  dialog.setAttribute('aria-labelledby', 'confirm-action-title');
  dialog.setAttribute('aria-describedby', 'confirm-action-description');
  const heading = document.createElement('h2');
  heading.id = 'confirm-action-title';
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.id = 'confirm-action-description';
  detail.textContent = description;
  const cancel = document.createElement('button');
  cancel.className = 'secondary';
  cancel.textContent = 'Keep playing';
  cancel.autofocus = true;
  const confirm = document.createElement('button');
  confirm.textContent = action;
  const controls = document.createElement('div');
  controls.append(cancel, confirm);
  dialog.append(heading, detail, controls);
  const close = () => {
    dialog.close();
    dialog.remove();
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus();
  };
  cancel.onclick = close;
  confirm.onclick = () => {
    close();
    onConfirm();
  };
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  host.append(dialog);
  dialog.showModal();
  cancel.focus();
}
