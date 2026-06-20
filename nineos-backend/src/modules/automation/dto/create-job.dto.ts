import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateJobDto {
  @ApiProperty({ example: 'content_publish' })
  @IsString()
  @IsNotEmpty()
  job_type: string;

  @ApiPropertyOptional({ example: 'matcha' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({ example: 'n8n', enum: ['n8n', 'manual', 'schedule'] })
  @IsIn(['n8n', 'manual', 'schedule'])
  triggered_by: 'n8n' | 'manual' | 'schedule';

  @ApiPropertyOptional()
  @IsOptional()
  payload?: Record<string, unknown>;
}
