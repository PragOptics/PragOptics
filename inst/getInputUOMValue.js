export function getInputUOMValue(inputType, inputUOM, inputUOMCustom){
  if ((inputType?.value || '') === 'custom') {
    return (inputUOMCustom?.value || '').trim() || null;
  }
  return (inputUOM?.value || '').trim() || null;
}