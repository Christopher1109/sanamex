/**
 * BancoConnector — interfaz para importar movimientos bancarios.
 *
 * Hoy se usa la implementación 'manual' (carga vía Excel/CSV desde la UI).
 * Cuando el cliente decida activar conexión directa con BBVA o MIFEL, basta
 * con llenar el método importarMovimientos() del stub correspondiente sin
 * tocar el resto del módulo de Bancos.
 */

export interface MovimientoImportado {
  fecha: string;          // YYYY-MM-DD
  concepto?: string;
  referencia?: string;
  cargo?: number;
  abono?: number;
  saldo?: number;
  contraparte_nombre?: string;
  contraparte_clabe?: string;
}

export interface BancoConnector {
  readonly nombre: string;
  importarMovimientos(params: {
    cuentaId: string;
    desde?: string;
    hasta?: string;
    archivo?: File;
  }): Promise<MovimientoImportado[]>;
}

/** Implementación manual: el archivo ya viene parseado por la UI. */
export class ManualConnector implements BancoConnector {
  readonly nombre = 'manual';
  async importarMovimientos({ }: any): Promise<MovimientoImportado[]> {
    // La UI parsea el Excel/CSV y manda al endpoint de insert directo;
    // este connector existe solo para uniformar la interfaz.
    return [];
  }
}

export class BBVAConnector implements BancoConnector {
  readonly nombre = 'bbva';
  async importarMovimientos(): Promise<MovimientoImportado[]> {
    throw new Error('BBVAConnector: No implementado — pendiente de credenciales API.');
  }
}

export class MIFELConnector implements BancoConnector {
  readonly nombre = 'mifel';
  async importarMovimientos(): Promise<MovimientoImportado[]> {
    throw new Error('MIFELConnector: No implementado — pendiente de credenciales API.');
  }
}

export const connectors: Record<string, BancoConnector> = {
  manual: new ManualConnector(),
  bbva: new BBVAConnector(),
  mifel: new MIFELConnector(),
};
