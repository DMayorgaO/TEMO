import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { HandoversService } from './handovers.service';
import { DollarPurchasesModule } from '../dollar-purchases/dollar-purchases.module';

@Module({
  imports: [DollarPurchasesModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, HandoversService],
})
export class ShiftsModule {}
