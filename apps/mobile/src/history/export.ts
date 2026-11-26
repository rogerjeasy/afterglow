/** Saving and printing reports: a file download, or a page of its own on paper. */

export function download(name: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printReport(text: string): void {
  // A printable page of its own: black text on white for paper, not the Night Shell.
  const holder = document.createElement('pre');
  holder.className = 'print-only';
  holder.textContent = text;
  document.body.append(holder);
  document.body.classList.add('printing-report');
  const done = (): void => {
    holder.remove();
    document.body.classList.remove('printing-report');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}
