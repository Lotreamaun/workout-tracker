/** Заменяет любые переводы строк (\r\n, \n, \r) пробелом: для полей, где перевод строки недопустим. */
export function toSingleLine(text: string): string {
  return text.replace(/\r\n|\n|\r/g, ' ');
}
