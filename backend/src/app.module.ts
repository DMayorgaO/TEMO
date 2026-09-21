import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { DatabaseModule } from './modules/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { DollarPurchasesModule } from './modules/dollar-purchases/dollar-purchases.module';
import { AppController } from './app.controller';
import { validateEnvironment } from './config/environment.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    CatalogsModule,
    ShiftsModule,
    TransactionsModule,
    TransfersModule,
    DirectoryModule,
    DollarPurchasesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
