-- =========================================================
-- Sesión 13-ago-2026: agrega "Vales de despensa" al catálogo de
-- Nómina. No existía ningún concepto para esto (confirmado al
-- explorar el sistema con el cliente).
--
-- OJO — el cliente no confirmó la regla exacta (dijo "chance es por
-- antigüedad", sin cerrar la fórmula). Este concepto se agrega para
-- poder avanzar con la presentación de mañana; la REGLA de cálculo
-- vive en src/services/NominaCalculator.ts con un comentario que
-- explica el supuesto usado y qué falta confirmar. No se debe
-- considerar definitivo hasta que el cliente lo confirme.
--
-- Código SAT 029 = "Vales de despensa" (catálogo c_TipoPercepcion).
-- Se marca exento de ISR/IMSS porque así opera típicamente esta
-- prestación en México dentro de los límites de ley — el sistema
-- todavía no valida el tope de exención, solo el concepto base.
-- =========================================================

INSERT INTO public.conceptos_nomina (clave, descripcion, tipo, codigo_sat, grava_isr, grava_imss, activo)
VALUES ('029', 'Vales de despensa', 'percepcion', '029', false, false, true)
ON CONFLICT (clave) DO NOTHING;
