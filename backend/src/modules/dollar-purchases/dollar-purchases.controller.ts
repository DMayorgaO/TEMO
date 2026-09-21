import { Controller, Get, Req } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { DollarPurchasesService } from './dollar-purchases.service';

@Controller('dollar-purchases')
export class DollarPurchasesController {
  constructor(private readonly dollarPurchases: DollarPurchasesService) {}

  // Expone el consolidado calculado exclusivamente al usuario autenticado autorizado.
  @Get()
  list(@Req() request: { user: AuthenticatedUser }) {
    return this.dollarPurchases.list(request.user);
  }
}
