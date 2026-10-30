export type CurrencySelection = 'NIO' | 'USD' | null;

export function currencyVisible(selection: CurrencySelection, currency: string) {
  return selection === null || selection === currency;
}

export function CurrencyFilter({value,onChange}:{value:CurrencySelection;onChange:(value:CurrencySelection)=>void}) {
  return <div className="currency-filter currency-filter--header" role="group" aria-label="Filtrar por moneda">
    {(['NIO','USD'] as const).map(currency=><button key={currency} type="button"
      className={`currency-filter__button currency-filter__button--${currency.toLowerCase()} ${value===currency?'currency-filter__button--active':''}`}
      aria-pressed={value===currency} title={currency==='NIO'?'Filtrar cordobas':'Filtrar dolares'}
      onClick={()=>onChange(value===currency?null:currency)}>{currency==='NIO'?'C$':'$'}</button>)}
  </div>;
}
