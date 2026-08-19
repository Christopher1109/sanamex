import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Alta rápida de cliente sin salir del punto de venta.
 *
 * Junta SANAMEX 15-ago-2026 (Isaac): "candado de cliente obligatorio" en POS
 * + alta de cliente desde la misma pantalla de venta, sin mandar al vendedor
 * al catálogo de clientes. El registro se guarda en el catálogo general
 * (tabla `clientes`), igual que si se hubiera dado de alta desde ClientesPage.
 */

export interface ClienteMinimo {
  id: string;
  nombre: string;
  rfc: string | null;
}

interface QuickClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** RFC o nombre que el usuario ya había escrito en el buscador, para precargar el form. */
  initialQuery?: string;
  onCreated: (cliente: ClienteMinimo) => void;
}

const emptyForm = { nombre: '', rfc: '', telefono: '', email: '' };

export default function QuickClienteDialog({ open, onOpenChange, initialQuery, onCreated }: QuickClienteDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Precarga el campo más probable según lo que el usuario tecleó en el buscador.
  const seed = () => {
    const q = (initialQuery || '').trim();
    const looksLikeRfc = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,3}$/i.test(q);
    setForm({ ...emptyForm, rfc: looksLikeRfc ? q.toUpperCase() : '', nombre: looksLikeRfc ? '' : q });
  };

  const handleOpenChange = (v: boolean) => {
    if (v) seed();
    else setForm(emptyForm);
    onOpenChange(v);
  };

  async function handleSave() {
    if (!form.nombre.trim()) {
      toast.error('El nombre del cliente es requerido');
      return;
    }
    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      rfc: form.rfc.trim() ? form.rfc.trim().toUpperCase() : null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      tipo: 'mayoreo',
      activo: true,
    };
    const { data, error } = await supabase.from('clientes').insert(payload).select('id, nombre, rfc').single();
    setSaving(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Ya existe un cliente con esa clave/RFC' : 'Error al crear el cliente');
      return;
    }
    toast.success('Cliente creado');
    onCreated(data as ClienteMinimo);
    setForm(emptyForm);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Alta rápida sin salir de la venta. Puedes completar el resto de los datos
            del cliente después en el catálogo de clientes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="qc-nombre">Nombre / Razón social *</Label>
            <Input
              id="qc-nombre"
              autoFocus
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre del cliente"
            />
          </div>
          <div>
            <Label htmlFor="qc-rfc">RFC</Label>
            <Input
              id="qc-rfc"
              value={form.rfc}
              onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
              placeholder="XAXX010101000"
              maxLength={13}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qc-telefono">Teléfono</Label>
              <Input
                id="qc-telefono"
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="qc-email">Email</Label>
              <Input
                id="qc-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Crear y seleccionar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
