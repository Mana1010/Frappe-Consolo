import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [ConnectionsModule],
  controllers: [RunsController],
  providers: [RunsService],
})
export class RunsModule {}
