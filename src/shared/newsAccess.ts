/**
 * FIX 2: Import News chỉ dành cho No AI Mode.
 * Ở AI Mode, AI tự tìm tin qua Check News nên không hiện nút Import.
 */
export function canImportNews(isAiEnabled: boolean): boolean {
  return !isAiEnabled
}
