export function getOutputUOMValue(outputType, outputUOM, outputUOMCustom) {
  if ((outputType?.value || '') === 'custom') {
    return (outputUOMCustom?.value || '').trim() || null;
  }
  return (outputUOM?.value || '').trim() || null;
}