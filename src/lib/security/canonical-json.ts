export function canonicalJson(value:unknown):string{
  const normalized:unknown=JSON.parse(JSON.stringify(value));
  function encode(item:unknown):string{
    if(item===null||typeof item!=='object')return JSON.stringify(item);
    if(Array.isArray(item))return `[${item.map(encode).join(',')}]`;
    const record=item as Record<string,unknown>;
    return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${encode(record[key])}`).join(',')}}`;
  }
  return encode(normalized);
}
