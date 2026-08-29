import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class RunToolDto {
  @ApiPropertyOptional({
    description: 'Argumen tool sesuai skema-nya',
    example: { platform: 'notabe', period: 'today' },
  })
  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Role pemanggil, untuk audit trail', example: 'CFO' })
  @IsOptional()
  @IsString()
  role_code?: string;
}

export class DecideActionDto {
  @ApiPropertyOptional({ description: 'Siapa yang memutuskan', example: 'founder' })
  @IsOptional()
  @IsString()
  decided_by?: string;
}
