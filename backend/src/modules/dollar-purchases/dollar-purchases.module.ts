import { Module } from '@nestjs/common';
import { DollarPurchasesController } from './dollar-purchases.controller';
import { DollarPurchasesService } from './dollar-purchases.service';

@Module({ controllers: [DollarPurchasesController], providers: [DollarPurchasesService] })
export class DollarPurchasesModule {}
