import { Injectable } from '@nestjs/common';

/** Secrets of saveSecret=false connections. Lost on restart by design. */
@Injectable()
export class SecretStore {
  private readonly map = new Map<string, string>();
  get = (id: string) => this.map.get(id);
  has = (id: string) => this.map.has(id);
  set = (id: string, secret: string) => void this.map.set(id, secret);
  delete = (id: string) => void this.map.delete(id);
}
