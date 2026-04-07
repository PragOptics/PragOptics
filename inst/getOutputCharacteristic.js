export function getOutputCharacteristic(value){
    const v = (value || 'linear').toString().toLowerCase();
    return (v === 'sqrt' || v === 'squareroot' || v === 'square_root') ? 'sqrt' : 'linear';
  }