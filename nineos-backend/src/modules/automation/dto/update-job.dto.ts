import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class UpdateJobDto {
  @ApiProperty({ example: 'success', enum: ['success', 'failed'] })
  @IsIn(['success', 'failed'])
  status: 'success' | 'failed';

  @ApiPropertyOptional()
  @IsOptional()
  result?: Record<string, unknown>;

  @ApiPropertyOptional({ example: '2026-06-20T09:00:00Z' })
  @IsOptional()
  @IsDateString()
  finished_at?: string;
}
