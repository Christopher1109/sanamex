import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface Product {
  id: string;
  nombre: string;
  sku: string;
  precio_base?: number;
}

interface Props {
  products: Product[];
  value: string;
  onSelect: (productId: string) => void;
  placeholder?: string;
}

const ProductSearchInput = ({ products, value, onSelect, placeholder = 'Buscar producto...' }: Props) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedProduct = products.find(p => p.id === value);

  useEffect(() => {
    if (selectedProduct) setQuery(`${selectedProduct.sku} — ${selectedProduct.nombre}`);
    else setQuery('');
  }, [value, selectedProduct]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query && !selectedProduct
    ? products.filter(p => {
        const s = query.toLowerCase();
        return p.nombre.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s);
      }).slice(0, 15)
    : query && selectedProduct
      ? []
      : products.slice(0, 15);

  return (
    <div ref={ref} className="relative flex-1">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onSelect('');
          }}
          onFocus={() => setOpen(true)}
          className="pl-9"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-[220px] overflow-y-auto">
          {filtered.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex justify-between items-center"
              onClick={() => {
                onSelect(p.id);
                setQuery(`${p.sku} — ${p.nombre}`);
                setOpen(false);
              }}
            >
              <span><span className="font-mono text-xs text-muted-foreground">{p.sku}</span> — {p.nombre}</span>
              {p.precio_base !== undefined && <span className="text-xs text-muted-foreground">${p.precio_base}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductSearchInput;
