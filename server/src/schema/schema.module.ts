import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { SchemaController } from './schema.controller';
import { SchemaService } from './schema.service';

@Module({
  imports: [ConnectionsModule],
  controllers: [SchemaController],
  providers: [SchemaService],
})
export class SchemaModule {}
