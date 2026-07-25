import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { DatabaseModule } from './modules/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { TransactionsModule } from './modules/transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    CatalogsModule,
    ShiftsModule,
    TransactionsModule,
  ],
})
export class AppModule {}
