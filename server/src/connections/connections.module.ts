import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { SecretStore } from './secret-store.service';
import { TempStore } from './temp-store.service';

@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService, SecretStore, TempStore],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
